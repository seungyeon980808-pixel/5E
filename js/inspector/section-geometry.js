/* ===== INSPECTOR SECTION — 크기·위치 (geometry + per-type rows) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { openAngleArcLabelEditor } from "../tools.js?v=1.5.4";
import { boxLabelSlots } from "../render.js?v=1.4.0";
import { makeSection } from "./widgets.js?v=1.4.0";
import { nodeBoxFromDiameter, nodeDiameterFromBox } from "../tools/node-placement.js?v=1.4.0";

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

  // ---- 여백 정리 (image·svgAsset): 상자를 실제로 보이는 그림에 맞춰 좁힌다.
  // 가위·지우개는 이미 자동으로 좁히지만, 옛 파일이나 여러 번 손댄 객체를 위한 손 경로다.
  // 실제 계산은 erase-tool.js의 trimSelectedBoxMargins → cut-geometry.js의 tightenBoxObject.
  const trimRow = document.createElement("div");
  trimRow.className = "insp-row";
  const trimBtn = document.createElement("button");
  trimBtn.type = "button";
  trimBtn.className = "modal-btn";
  trimBtn.style.width = "100%";
  trimBtn.textContent = "여백 정리";
  trimBtn.title = "상자를 실제로 보이는 그림에 맞춰 좁힙니다.\n빈 곳이 눌리거나 정렬·내보내기 여백이 어긋날 때 쓰세요.";
  trimRow.appendChild(trimBtn);
  sec3Body.appendChild(trimRow);
  trimBtn.addEventListener("click", async () => {
    const mod = await import("../erase-tool.js?v=1.4.0");
    const n = mod.trimSelectedBoxMargins();
    const orig = trimBtn.textContent;
    trimBtn.textContent = n > 0 ? "정리했습니다" : "좁힐 여백 없음";
    setTimeout(() => { trimBtn.textContent = orig; }, 1200);
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
  // 라벨 2×2 배열: [종류][위치] / [라벨][ ] — 편집/표시는 그리드 아래 전폭.
  const labelGridA = document.createElement("div");
  labelGridA.className = "insp-2col";
  sec3Body.appendChild(labelGridA);
  const objectLabelTypeRow = makeLabelTypeRow((o) => o.type === "anglearc" || o.type === "optics" || o.type === "circuit");
  labelGridA.appendChild(objectLabelTypeRow.row);
  { const l = objectLabelTypeRow.row.querySelector(".insp-field-label"); if (l) l.textContent = "종류"; }

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
  arcLabelEditBtn.style.cssText = "padding:4px 10px;font-size: 11px;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  arcLabelEditBtn.addEventListener("click", () => {
    const id = (state.get().selectedIds || [])[0];
    if (id) openAngleArcLabelEditor(id);
  });
  arcLabelEditRow.appendChild(arcLabelEditLbl);
  arcLabelEditRow.appendChild(arcLabelEditBtn);

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
  labelPosLbl.textContent = "위치";
  const labelPosSel = document.createElement("select");
  labelPosSel.className = "insp-input";
  [["above", "위 (above)"], ["below", "아래 (below)"]].forEach(([val, text]) => {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = text;
    labelPosSel.appendChild(opt);
  });
  labelPosRow.appendChild(labelPosLbl);
  labelPosRow.appendChild(labelPosSel);
  labelGridA.appendChild(labelPosRow);

  /* node-only: 점 지름(mm) — 표시점 크기를 숫자로 정한다(사용자 요구 2026-07-28).
   * 표시점은 bbox(w,h)로 저장되고 실제 점은 그 안에 비율로 그려지므로,
   * 입력값(지름) ↔ bbox 변환은 node-placement.js 의 식을 그대로 쓴다(두 곳이 어긋나면
   * 새로 놓은 점과 숫자로 고친 점의 크기가 달라진다). */
  const nodeSizeRow = document.createElement("div");
  nodeSizeRow.className = "insp-row";
  const nodeSizeLbl = document.createElement("label");
  nodeSizeLbl.className = "insp-field-label";
  nodeSizeLbl.textContent = "점 지름";
  const nodeSizeInp = document.createElement("input");
  nodeSizeInp.type = "number";
  nodeSizeInp.min = "0.2";
  nodeSizeInp.max = "20";
  nodeSizeInp.step = "0.1";
  nodeSizeInp.className = "insp-input";
  const nodeSizeWrap = document.createElement("span");
  nodeSizeWrap.style.cssText = "position:relative;display:block;min-width:0;";
  nodeSizeInp.style.cssText = "width:100%;box-sizing:border-box;padding-right:26px;";
  const nodeSizeUnit = document.createElement("span");
  nodeSizeUnit.textContent = "mm";
  nodeSizeUnit.style.cssText = "position:absolute;right:8px;top:50%;transform:translateY(-50%);" +
    "font-size:10px;color:var(--text-secondary);pointer-events:none;";
  nodeSizeWrap.appendChild(nodeSizeInp);
  nodeSizeWrap.appendChild(nodeSizeUnit);
  nodeSizeRow.appendChild(nodeSizeLbl);
  nodeSizeRow.appendChild(nodeSizeWrap);
  labelGridA.appendChild(nodeSizeRow);

  // 입력할 때마다 반영하되 Undo 스냅샷은 편집 세션당 한 번(라벨 크기 행과 같은 방식).
  let nodeSizeSnap = null;
  const applyNodeSize = () => {
    const d = Number(nodeSizeInp.value);
    if (!isFinite(d) || d < 0.2) return;          // 입력 중 미완성 값은 무시
    const box = nodeBoxFromDiameter(Math.min(20, d));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === (s2.selectedIds || [])[0]);
      if (!o || o.type !== "optics" || o.kind !== "node" || o.locked) return;
      if (Math.abs((o.w ?? 0) - box) < 1e-6 && Math.abs((o.h ?? 0) - box) < 1e-6) return;
      if (nodeSizeSnap) { s2.undoStack.push(nodeSizeSnap); s2.redoStack = []; nodeSizeSnap = null; }
      // 중심을 유지한 채 크기만 바꾼다 — 안 그러면 숫자를 고칠 때 점이 옆으로 밀린다.
      const cx = (o.x ?? 0) + (o.w ?? 0) / 2;
      const cy = (o.y ?? 0) + (o.h ?? 0) / 2;
      o.w = box; o.h = box;
      o.x = cx - box / 2; o.y = cy - box / 2;
    });
  };
  nodeSizeInp.addEventListener("focus", () => {
    nodeSizeSnap = JSON.parse(JSON.stringify(state.get().objects));
  });
  nodeSizeInp.addEventListener("input", applyNodeSize);
  nodeSizeInp.addEventListener("change", () => { applyNodeSize(); nodeSizeSnap = null; });
  labelGridA.appendChild(labelRow);      // 2행 1열: 라벨
  sec3Body.appendChild(arcLabelEditRow); // 라벨 편집... (전폭)
  sec3Body.appendChild(showLabelRow);    // 라벨 표시 (전폭)
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

  /* ---- 라벨 가림(할로) — 라벨이 있는 모든 도형 공통 ----
   * 기본은 '글자 모양대로만' 가린다(옆 글자를 건드리지 않는다).
   * 배경 가림을 켜면 라벨 뒤를 흰 사각형으로 통째로 지운다 — 회색 면·격자 위처럼
   * 글자 사이 틈으로 배경이 비치는 게 거슬리는 그림에서만 쓴다(2026-07-26 교사 결정). */
  function commitLabelProp(prop, value) {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.locked) return;
      if ((o[prop] ?? null) === value) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      if (value === null || value === false) delete o[prop]; else o[prop] = value;
    });
  }
  const labelBgRow = document.createElement("div");
  labelBgRow.className = "insp-row";
  const labelBgLbl = document.createElement("label");
  labelBgLbl.className = "insp-field-label";
  labelBgLbl.textContent = "배경 가림";
  const labelBgCb = document.createElement("input");
  labelBgCb.type = "checkbox";
  labelBgCb.title = "라벨 뒤를 흰 사각형으로 통째로 지웁니다(글자 사이 틈까지). 끄면 글자 모양대로만 가립니다";
  labelBgRow.appendChild(labelBgLbl); labelBgRow.appendChild(labelBgCb);
  sec3Body.appendChild(labelBgRow);
  labelBgCb.addEventListener("change", () => commitLabelProp("labelBg", labelBgCb.checked || null));

  const labelHaloRow = document.createElement("div");
  labelHaloRow.className = "insp-row";
  const labelHaloLbl = document.createElement("label");
  labelHaloLbl.className = "insp-field-label";
  labelHaloLbl.textContent = "가림 굵기";
  const labelHaloInp = document.createElement("input");
  labelHaloInp.type = "number";
  labelHaloInp.className = "insp-input";
  labelHaloInp.min = 0; labelHaloInp.max = 0.6; labelHaloInp.step = 0.01;
  labelHaloInp.placeholder = "0.13";
  labelHaloInp.title = "글자 크기 대비 흰 테두리 굵기. 비우면 기본값 0.13";
  labelHaloRow.appendChild(labelHaloLbl); labelHaloRow.appendChild(labelHaloInp);
  sec3Body.appendChild(labelHaloRow);
  const fireHalo = () => {
    const raw = labelHaloInp.value.trim();
    if (raw === "") { commitLabelProp("haloRatio", null); return; }
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    commitLabelProp("haloRatio", Math.min(0.6, Math.max(0, v)));
  };
  labelHaloInp.addEventListener("input", fireHalo);
  labelHaloInp.addEventListener("change", fireHalo);

  function syncLabelHalo(o) {
    labelBgCb.checked = !!o.labelBg;
    if (document.activeElement !== labelHaloInp) {
      labelHaloInp.value = Number.isFinite(o.haloRatio) ? o.haloRatio : "";
    }
  }

  /* 라벨선 추가(요구 2026-07-26): 지시선을 하나 더 뽑아 두 영역을 하나의 라벨로 가리킨다.
   * 켜면 p3(두 번째 지시선 끝점)가 생기고, 캔버스에 세 번째 핸들이 나와 끌 수 있다. */
  const labelerLine2Row = document.createElement("div");
  labelerLine2Row.className = "insp-row";
  const labelerLine2Lbl = document.createElement("label");
  labelerLine2Lbl.className = "insp-field-label";
  labelerLine2Lbl.textContent = "라벨선";
  const labelerLine2Btn = document.createElement("button");
  labelerLine2Btn.type = "button";
  labelerLine2Btn.className = "insp-input";
  labelerLine2Btn.title = "지시선을 하나 더 만들어 두 곳을 한 라벨로 가리킵니다";
  labelerLine2Row.appendChild(labelerLine2Lbl);
  labelerLine2Row.appendChild(labelerLine2Btn);
  sec3Body.appendChild(labelerLine2Row);
  labelerLine2Btn.addEventListener("click", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "labeler" || o.locked) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      if (o.p3) { delete o.p3; return; }
      // 첫 지시선을 라벨 기준으로 반대편에 복사해 둔다 — 바로 눈에 띄고 끌어 옮기기 쉽다.
      o.p3 = { x: o.p2.x + (o.p2.x - o.p1.x), y: o.p2.y + (o.p2.y - o.p1.y) };
    });
    syncLabelerLine2();
  });
  function syncLabelerLine2() {
    const s = state.get();
    const o = (s.objects || []).find((it) => it.id === (s.selectedIds || [])[0]);
    labelerLine2Btn.textContent = (o && o.p3) ? "제거" : "추가";
  }

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

  /* ---- rect/ellipse 상자 라벨: 안쪽·바깥 두 슬롯 (docs/BOX_LABEL_DUAL_SPEC.md) ----
   * 기출 도판은 상자 하나에 글자를 둘 붙인다 — 안쪽에 물리량(m_B), 바깥에 이름표(B).
   *   안쪽: 항상 상자 중앙. 서체를 물리량(이탤릭·아래첨자)/이름표(정체) 중 고른다.
   *   바깥: 언제나 이름표(정체). 위·아래·왼쪽·오른쪽 중 고른다.
   * 슬롯을 끄면 그 슬롯의 글자를 비운다 — 렌더러가 "빈 문자열 = 꺼짐"으로 읽는다
   * (labels.js boxLabelSlots). 그래서 표시 여부용 필드를 따로 두지 않는다.
   * 필드: labelInner / labelInnerType / labelOuter / labelOuterPos, labelSize는 공유. */
  const BOX_LABEL_APPLIES = (o) => o.type === "rect" || o.type === "ellipse";

  /* 새 필드가 아직 없는 상자(구파일·구버전에서 만든 것)는 렌더러와 **같은 규칙**으로 읽는다
   * (render/labels.js boxLabelSlots) — 그래야 화면에 보이는 라벨이 패널에도 그대로 뜬다. */
  function readSlot(obj, prop) {
    if (obj.labelInner != null || obj.labelOuter != null) return obj[prop];
    const s = boxLabelSlots(obj);
    if (prop === "labelInner") return s.inner.text;
    if (prop === "labelInnerType") return s.inner.type || "quantity";
    if (prop === "labelOuter") return s.outer.text;
    if (prop === "labelOuterPos") return s.outer.pos;
    if (prop === "labelOuterType") return s.outer.type || "label";
    return obj[prop];
  }
  /* 첫 편집에서 옛 단일 슬롯을 새 두 슬롯으로 굳힌다 — 파일 열기 마이그레이션과 같은 규칙.
   * 이걸 안 하면 안쪽만 쓴 순간 렌더러가 새 필드 쪽으로 넘어가 바깥 라벨이 사라진다. */
  function ensureSlots(o) {
    if (o.labelInner != null || o.labelOuter != null) return;
    const s = boxLabelSlots(o);
    o.labelInner = s.inner.text;
    o.labelInnerType = s.inner.type || "quantity";
    o.labelOuter = s.outer.text;
    o.labelOuterPos = s.outer.pos;
    o.labelOuterType = s.outer.type || "label";
  }

  // 라벨 2×2 배열: [안쪽 글자][서체] / [바깥 글자][위치] + [크기]
  const labelGridB = document.createElement("div");
  labelGridB.className = "insp-2col";
  sec3Body.appendChild(labelGridB);

  /* 체크박스를 머리글에 얹은 글자 입력 칸. 체크를 끄면 글자를 비우되 이번 세션 동안은
   * 기억해 둔다(stash) — 껐다 켰다 하며 비교할 때 다시 타이핑하지 않게. */
  function makeSlotTextRow(labelText, prop, onToggle) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.style.cssText = "display:flex;align-items:center;gap:4px;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.cssText = "width:auto;flex:0 0 auto;margin:0;";
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(labelText));
    const inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 60;
    inp.className = "insp-input";
    row.appendChild(lbl);
    row.appendChild(inp);

    const stash = new Map(); // objId → 껐을 때의 글자
    let pendingId = null;    // 켰지만 아직 글자를 안 넣은 객체 — 체크가 되돌아가지 않게

    function commit() {
      commitSelectedObject((o) => {
        if (!BOX_LABEL_APPLIES(o)) return false;
        if ((readSlot(o, prop) ?? "") === inp.value) return false; // no-op → undo 항목 안 만든다
        ensureSlots(o);
        o[prop] = inp.value;
        return true;
      });
    }
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", commit);

    cb.addEventListener("change", () => {
      const s = state.get();
      const id = (s.selectedIds || [])[0];
      if (!id) return;
      if (cb.checked) {
        pendingId = id;
        const back = stash.get(id) || "";
        inp.value = back;
        inp.disabled = false;
        if (back) commit(); else inp.focus();
      } else {
        pendingId = null;
        const cur = inp.value;
        if (cur) stash.set(id, cur);
        inp.value = "";
        commitSelectedObject((o) => {
          if (!BOX_LABEL_APPLIES(o) || !(readSlot(o, prop) ?? "")) return false;
          ensureSlots(o);
          o[prop] = "";
          return true;
        });
      }
      if (onToggle) onToggle(cb.checked);
    });

    return {
      row, cb, inp,
      on() { return cb.checked; },
      sync(obj) {
        const text = readSlot(obj, prop) ?? "";
        const on = !!text || pendingId === obj.id;
        if (pendingId && pendingId !== obj.id) pendingId = null;
        cb.checked = on;
        if (document.activeElement !== inp) inp.value = text;
        inp.disabled = !on || !!obj.locked;
      },
      setLocked(locked) { cb.disabled = !!locked; if (locked) inp.disabled = true; },
    };
  }

  /* 드롭다운 한 줄 — 값이 정해진 목록 안에 있을 때만 쓴다. */
  function makeSlotSelectRow(labelText, prop, options, fallback) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const sel = document.createElement("select");
    sel.className = "insp-input";
    options.forEach(([val, text]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = text;
      sel.appendChild(opt);
    });
    row.appendChild(lbl);
    row.appendChild(sel);
    const allowed = options.map(([v]) => v);
    sel.addEventListener("change", () => {
      const val = allowed.includes(sel.value) ? sel.value : fallback;
      commitSelectedObject((o) => {
        if (!BOX_LABEL_APPLIES(o) || readSlot(o, prop) === val) return false;
        ensureSlots(o);
        o[prop] = val;
        return true;
      });
    });
    return {
      row, sel,
      sync(obj) {
        const cur = readSlot(obj, prop);
        sel.value = allowed.includes(cur) ? cur : fallback;
      },
    };
  }

  /* 배치: [✓안쪽][서체] / [✓바깥][서체] / [위치][크기]
   * 서체를 같은 열에 세워 두 슬롯을 나란히 읽게 한다(DESIGN 13-1 세로 기준선). */
  const LABEL_FONTS = [["quantity", "물리량"], ["label", "이름표"]];
  const boxInnerRow = makeSlotTextRow("안쪽", "labelInner", () => syncBoxLabelEnabled());
  const boxInnerTypeRow = makeSlotSelectRow("서체", "labelInnerType", LABEL_FONTS, "quantity");
  const boxOuterRow = makeSlotTextRow("바깥", "labelOuter", () => syncBoxLabelEnabled());
  // 바깥도 물리량을 쓸 수 있다(2026-07-31). 기본은 이름표 — 옛 그림이 그대로 보이게.
  const boxOuterTypeRow = makeSlotSelectRow("서체", "labelOuterType", LABEL_FONTS, "label");
  const boxOuterPosRow = makeSlotSelectRow("위치", "labelOuterPos",
    [["above", "위"], ["below", "아래"], ["left", "왼쪽"], ["right", "오른쪽"]], "right");
  labelGridB.appendChild(boxInnerRow.row);
  labelGridB.appendChild(boxInnerTypeRow.row);
  labelGridB.appendChild(boxOuterRow.row);
  labelGridB.appendChild(boxOuterTypeRow.row);
  labelGridB.appendChild(boxOuterPosRow.row);

  /* 꺼진 슬롯의 서체·위치는 쓸 데가 없다 → 비활성(조건을 채우면 쓸 수 있다는 뜻, DESIGN 13-3). */
  function syncBoxLabelEnabled(locked = false) {
    boxInnerTypeRow.sel.disabled = locked || !boxInnerRow.on();
    boxOuterTypeRow.sel.disabled = locked || !boxOuterRow.on();
    boxOuterPosRow.sel.disabled = locked || !boxOuterRow.on();
  }

  const boxLabel = {
    rows: [boxInnerRow.row, boxInnerTypeRow.row, boxOuterRow.row,
           boxOuterTypeRow.row, boxOuterPosRow.row],
    grid: labelGridB,
    sync(obj) {
      boxInnerRow.sync(obj);
      boxOuterRow.sync(obj);
      boxInnerTypeRow.sync(obj);
      boxOuterTypeRow.sync(obj);
      boxOuterPosRow.sync(obj);
      boxInnerRow.setLocked(obj.locked);
      boxOuterRow.setLocked(obj.locked);
      syncBoxLabelEnabled(!!obj.locked);
    },
    setVisible(on) {
      labelGridB.style.display = on ? "" : "none";
    },
  };

  // ---- rect/ellipse 라벨 크기 (Group 6 task 6): per-box label font size. ----
  const boxLabelSizeRow = makeLabelSizeRow((o) => o.type === "rect" || o.type === "ellipse", "크기");
  labelGridB.appendChild(boxLabelSizeRow.row); // 3행 1열: 크기 (두 슬롯이 공유)

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

  // 회로 소자 크기 배율(2026-07-31): 몸통·원·기호가 함께 커진다. 단자 위치는 그대로.
  const bodyScaleRow = document.createElement("div");
  bodyScaleRow.className = "insp-row";
  const bodyScaleLbl = document.createElement("label");
  bodyScaleLbl.className = "insp-field-label";
  bodyScaleLbl.textContent = "소자 크기";
  const bodyScaleInp = document.createElement("input");
  bodyScaleInp.type = "number";
  bodyScaleInp.step = "0.1";
  bodyScaleInp.min = "0.5";
  bodyScaleInp.max = "3";
  bodyScaleInp.className = "insp-input";
  const bodyScaleUnit = document.createElement("span");
  bodyScaleUnit.className = "insp-unit";
  bodyScaleUnit.textContent = "×";
  bodyScaleRow.appendChild(bodyScaleLbl);
  bodyScaleRow.appendChild(bodyScaleInp);
  bodyScaleRow.appendChild(bodyScaleUnit);
  sec3Body.appendChild(bodyScaleRow);
  function commitBodyScale() {
    const val = parseFloat(bodyScaleInp.value);
    if (!isFinite(val) || val <= 0) return;
    commitSelectedObject((o) => {
      if (o.type !== "circuit" || o.bodyScale === val) return false;
      o.bodyScale = val;
      return true;
    });
  }
  bodyScaleInp.addEventListener("keydown", (e) => { if (e.key === "Enter") bodyScaleInp.blur(); });
  bodyScaleInp.addEventListener("blur", commitBodyScale);

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
      "flex:1;padding:4px 0;margin-left:4px;border:1px solid var(--border);border-radius:4px;" +
      "background:var(--bg-input);color:#ddd;cursor:pointer;font-size: 12px;";
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
    sec3, xF, yF, wF, hF, rotF, xyPair, whPair, lockAspectRow, lockAspectCb, trimRow,
    radF, saF, swF, arcPair,
    labelRow, labelInp, objectLabelTypeRow, arcLabelEditRow, arcLabelEditBtn,
    showLabelRow, showLabelCb, labelPosRow, labelPosSel, nodeSizeRow, nodeSizeInp,
    labelerLenRow, labelerLenInp, labelerAngleRow, labelerAngleInp,
    labelBgRow, labelHaloRow, syncLabelHalo,
    labelerLine2Row, syncLabelerLine2,
    boxLabel, boxLabelSizeRow,
    gapRow, gapInp, circuitHeightF, bodyScaleRow, bodyScaleInp,
    axisVarRow, axisVarBtns, axisLabelXRow, axisLabelYRow, axisLabelTypeRow, tickRow, tickInp,
    centerLineRow, centerLineSel, term1, term2, terminalLabelTypeRow,
    raSizeF, raAngleF, raDirRow, raDirSel,
    appLengthF, appAngleF, appThicknessF, appNeedleF,
    pulleyVariantRow, pulleyVariantSel, clampFlipRow, clampFlipCb, scaleTextRow, scaleTextInp,
  };
}

/* ===== INSPECTOR SECTION — 선 (stroke / arrows / dash / angle) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { makeColorPicker, makeSection, supportsDash, DASH_PRESETS } from "./widgets.js?v=1.3.0";
// 패턴 유효성 판정은 렌더러(applyDash)와 같은 함수를 써야 인스펙터 표시와 실제 그림이 안 어긋난다.
import { normalizeDashPattern } from "../render/core.js?v=1.3.0";

export function buildLineSection(ctx) {
  const { state, snapBefore, pushSnap, makeLabelSizeRow, makeLabelTypeRow } = ctx;

  /* ---- Section 1: 선 ---- */
  const sec1Body = document.createElement("div");
  sec1Body.className = "insp-body insp-line-grid"; // fixed-width label column (Illustrator-style)

  let _strokeSnap = null;
  const strokeCP = makeColorPicker(
    (lv) => {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (!ids.length) return;
      state.update((s2) => {
        (s2.selectedIds || []).forEach(id => {
          const o = s2.objects.find((o) => o.id === id);
          if (o) o.strokeLevel = lv;
        });
      });
    },
    () => { _strokeSnap = snapBefore(); },
    () => { pushSnap(_strokeSnap); _strokeSnap = null; }
  );
  sec1Body.appendChild(strokeCP.el);

  // Stroke width row
  const widthRow = document.createElement("div");
  widthRow.className = "insp-row";
  const widthLbl = document.createElement("label");
  widthLbl.className = "insp-field-label";
  widthLbl.textContent = "선 굵기";
  const widthRange = document.createElement("input");
  widthRange.type = "range";
  widthRange.min = "0.1";
  widthRange.max = "0.5";
  widthRange.step = "0.1";
  widthRange.className = "insp-range";
  const widthNum = document.createElement("input");
  widthNum.type = "number";
  widthNum.min = "0.1";
  widthNum.max = "0.5";
  widthNum.step = "0.1";
  widthNum.style.cssText = "width:40px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
  const widthUnit = document.createElement("span");
  widthUnit.textContent = "mm";
  widthUnit.className = "insp-unit";
  widthRow.appendChild(widthLbl);
  widthRow.appendChild(widthRange);
  widthRow.appendChild(widthNum);
  widthRow.appendChild(widthUnit);
  sec1Body.appendChild(widthRow);

  // Arrow head control (line objects only)
  const arrowRow = document.createElement("div");
  arrowRow.className = "insp-row";
  const arrowLbl = document.createElement("label");
  arrowLbl.className = "insp-field-label";
  arrowLbl.textContent = "화살표";
  const arrowBtns = document.createElement("div");
  arrowBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  // 40×24 inline-SVG previews: horizontal line + barbed arrowhead(s).
  const ARROW_ICONS = {
    none:   '<line x1="4" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>',
    end:    '<line x1="4" y1="12" x2="30" y2="12" stroke="#888" stroke-width="1.5"/>' +
            '<polygon points="30,8 36,12 30,16" fill="#888"/>',
    start:  '<line x1="10" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>' +
            '<polygon points="10,8 4,12 10,16" fill="#888"/>',
    center: '<line x1="4" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>' +
            '<polygon points="14,8 20,12 14,16" fill="#888"/>',
    both:   '<line x1="4" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>' +
            '<polygon points="10,8 4,12 10,16" fill="#888"/>' +
            '<polygon points="30,8 36,12 30,16" fill="#888"/>',
    // two arrows at ~1/3 and ~2/3, BOTH pointing inward toward the midpoint.
    midInward: '<line x1="4" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>' +
            '<polygon points="11,8 17,12 11,16" fill="#888"/>' +
            '<polygon points="29,8 23,12 29,16" fill="#888"/>',
    // 물결 화살표: 진폭 일정 + 짧은 직선부 + 화살촉(객체와 같은 모양).
    wavy:   '<path d="M4 12 q2.7 -4.5 5.3 0 q2.7 4.5 5.3 0 q2.7 -4.5 5.3 0 q2.7 4.5 5.3 0 L30 12" ' +
            'fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>' +
            '<polygon points="30,8 36,12 30,16" fill="#888"/>',
    // 축척 막대 — 양 끝 세로 바 + 위 라벨 자리(지도 관례)
    scaleBar: '<line x1="6" y1="14" x2="34" y2="14" stroke="#888" stroke-width="1.5"/>' +
            '<line x1="6" y1="10" x2="6" y2="18" stroke="#888" stroke-width="1.5"/>' +
            '<line x1="34" y1="10" x2="34" y2="18" stroke="#888" stroke-width="1.5"/>' +
            '<line x1="12" y1="6" x2="28" y2="6" stroke="#bbb" stroke-width="1.5"/>',
  };
  const MIDDLE_LEFT_ICON = '<line x1="4" y1="12" x2="36" y2="12" stroke="#888" stroke-width="1.5"/>' +
    '<polygon points="26,8 20,12 26,16" fill="#888"/>';
  const lengthIcon = (variant) => ARROW_ICONS.both +
    ((variant === "leftBar" || variant === "bothBars") ? '<line x1="4" y1="6" x2="4" y2="18" stroke="#888" stroke-width="1.5"/>' : '') +
    ((variant === "rightBar" || variant === "bothBars") ? '<line x1="36" y1="6" x2="36" y2="18" stroke="#888" stroke-width="1.5"/>' : '');
  const ARROW_CYCLE = ["end", "start", "both", "none"];
  const ARROW_LABELS = { end: "정방향", start: "역방향", both: "양끝", none: "없음" };
  const arrowBtn = document.createElement("button");
  arrowBtn.style.cssText = "width:40px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  arrowBtn.addEventListener("click", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.locked) return; // 잠긴 객체는 화살표 변경 금지
      if (o && (o.type === "line" || o.type === "polyline")) {
        const current = ARROW_CYCLE.includes(o.arrowHead) ? o.arrowHead : "none";
        o.arrowHead = ARROW_CYCLE[(ARROW_CYCLE.indexOf(current) + 1) % ARROW_CYCLE.length];
        s2.undoStack.push(snap);
        s2.redoStack = [];
      }
    });
  });
  arrowBtns.appendChild(arrowBtn);
  arrowRow.appendChild(arrowLbl);
  arrowRow.appendChild(arrowBtns);
  sec1Body.appendChild(arrowRow);

  // Straight-line mode dials. Re-clicking the active mode advances its variant.
  const lineModeRow = document.createElement("div");
  lineModeRow.className = "insp-row";
  const lineModeLbl = document.createElement("label");
  lineModeLbl.className = "insp-field-label";
  lineModeLbl.textContent = "화살표 종류";
  const lineModeBtns = document.createElement("div");
  lineModeBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  const LINE_MODES = [
    { value: "solid", label: "Solid", icon: ARROW_ICONS.none },
    { value: "arrow", label: "Arrow", icon: ARROW_ICONS.end },
    { value: "middleArrow", label: "Middle arrow", icon: ARROW_ICONS.center },
    { value: "midInward", label: "Inward double arrow", icon: ARROW_ICONS.midInward },
    { value: "lengthArrow", label: "Length arrow", icon: ARROW_ICONS.both },
    { value: "wavyArrow", label: "물결 화살표 (광자·전자기파)", icon: ARROW_ICONS.wavy },
    // 다시 누르면 모양이 순환한다(양끝 바 → 흑백 교차 → 선만) — 다른 모드와 같은 규약.
    { value: "scaleBar", label: "축척 막대 (지도·현미경) — 다시 누르면 모양 순환", icon: ARROW_ICONS.scaleBar },
  ];
  const lineModeBtnEls = {};
  LINE_MODES.forEach(({ value, label, icon }) => {
    const btn = document.createElement("button");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${icon}</svg>`;
    btn.style.cssText = "width:40px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
    btn.addEventListener("click", () => {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (ids.length !== 1) return;
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const o = s2.objects.find((item) => item.id === ids[0]);
        if (!o || o.type !== "line" || o.locked) return; // 잠긴 객체는 선 모드 변경 금지
        const oldMode = o.lineMode
          ?? (o.lineStyle === "dimensionArrow" ? "lengthArrow" : o.lineStyle)
          ?? (o.arrowHead === "center" ? "middleArrow" : (o.arrowHead ?? "none") === "none" ? "solid" : "arrow");
        if (value === "arrow") {
          const cycle = ["right", "left", "both"];
          const current = cycle.includes(o.arrowVariant)
            ? o.arrowVariant
            : ({ end: "right", start: "left", both: "both" }[o.arrowHead] || "right");
          o.arrowVariant = oldMode === value ? cycle[(cycle.indexOf(current) + 1) % cycle.length] : "right";
          o.arrowHead = { right: "end", left: "start", both: "both" }[o.arrowVariant];
        } else if (value === "middleArrow") {
          const current = o.arrowVariant === "left" ? "left" : "right";
          o.arrowVariant = oldMode === value && current === "right" ? "left" : "right";
          o.arrowHead = "none";
        } else if (value === "lengthArrow") {
          const cycle = ["basic", "rightBar", "leftBar", "bothBars"];
          const current = cycle.includes(o.dimensionVariant) ? o.dimensionVariant : "basic";
          o.dimensionVariant = oldMode === value ? cycle[(cycle.indexOf(current) + 1) % cycle.length] : "basic";
          o.dimensionLabel ??= "d";
          o.arrowHead = "none";
        } else if (value === "scaleBar") {
          const cycle = ["bars", "alt", "simple"];
          const current = cycle.includes(o.scaleBarVariant) ? o.scaleBarVariant : "bars";
          o.scaleBarVariant = oldMode === value ? cycle[(cycle.indexOf(current) + 1) % cycle.length] : "bars";
          // 라벨 필드는 치수선과 공유한다. 축척은 단위가 붙는 게 관례라 기본값을 다르게 준다.
          o.dimensionLabel ??= "0 - 200 km";
          o.arrowHead = "none";
        } else {
          o.arrowHead = "none";
        }
        o.lineMode = value;
        o.lineStyle = value === "lengthArrow" ? "dimensionArrow" : value;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
    });
    lineModeBtnEls[value] = btn;
    lineModeBtns.appendChild(btn);
  });
  lineModeRow.appendChild(lineModeLbl);
  lineModeRow.appendChild(lineModeBtns);
  sec1Body.appendChild(lineModeRow);

  const dimensionLabelRow = document.createElement("div");
  dimensionLabelRow.className = "insp-row";
  const dimensionLabelLbl = document.createElement("label");
  dimensionLabelLbl.className = "insp-field-label";
  dimensionLabelLbl.textContent = "라벨";
  const dimensionLabelInp = document.createElement("input");
  dimensionLabelInp.type = "text";
  dimensionLabelInp.maxLength = 40;
  dimensionLabelInp.style.cssText = "width:90px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:3px 5px;background:var(--bg-input);color:var(--text-primary);";
  dimensionLabelInp.addEventListener("change", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === id);
      if (!o || o.type !== "line") return;
      o.dimensionLabel = dimensionLabelInp.value || "d";
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  dimensionLabelRow.appendChild(dimensionLabelLbl);
  dimensionLabelRow.appendChild(dimensionLabelInp);
  sec1Body.appendChild(dimensionLabelRow);
  const dimensionLabelTypeRow = makeLabelTypeRow((o) => o.type === "line");
  sec1Body.appendChild(dimensionLabelTypeRow.row);
  // 치수 라벨(길이 표시 모드)의 글자 크기: obj.dimensionLabelSize (mm)에 저장.
  // 미설정 시 render/shapes.js가 선 두께 기반 자동 크기로 폴백한다.
  const dimensionLabelSizeRow = makeLabelSizeRow((o) => o.type === "line", "라벨 크기", "dimensionLabelSize");
  sec1Body.appendChild(dimensionLabelSizeRow.row);

  /* ---- 물결 화살표 전용: 파장·진폭 (lineMode "wavyArrow"일 때만 보인다) ----
   * 파장은 mm다 — 선을 길게 뽑아도 물결의 촘촘함이 유지된다. 렌더러는 이 값으로
   * 파장 수를 정수로 반올림하므로 화살촉은 항상 축 위에서 만난다. */
  function wavyNumberRow(labelText, prop, fallback, { min, max, step }) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = min; inp.max = max; inp.step = step;
    inp.style.cssText = "width:70px;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:3px 5px;background:var(--bg-input);color:var(--text-primary);";
    const fire = () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      const s = state.get();
      const id = (s.selectedIds || [])[0];
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const o = s2.objects.find((item) => item.id === id);
        if (!o || o.type !== "line" || o.locked) return;
        const nv = Math.min(max, Math.max(min, v));
        if (o[prop] === nv) return;
        s2.undoStack.push(snap); s2.redoStack = [];
        o[prop] = nv;
      });
    };
    inp.addEventListener("input", fire);
    inp.addEventListener("change", fire);
    row.appendChild(lbl); row.appendChild(inp);
    sec1Body.appendChild(row);
    return { row, inp, fallback };
  }
  const waveLengthRow = wavyNumberRow("파장(mm)", "waveLength", 5, { min: 1, max: 40, step: 0.5 });
  const waveAmpRow = wavyNumberRow("진폭(mm)", "waveAmp", 1.1, { min: 0.2, max: 12, step: 0.1 });
  // 직선부는 파장에 비례한다(화살촉 길이 비례는 기본 굵기에서 안 보였다).
  const waveTailRow = wavyNumberRow("직선부(파장 대비)", "tailRatio", 0.35, { min: 0, max: 2, step: 0.05 });

  /* ---- straight-line upright label (Group 3): text input + on/off toggle ----
   * Writes obj.label / obj.labelShow. When on, render.js (withLineLabel) draws
   * the text screen-upright, centered above the line midpoint, default font. */
  const lineLabelRow = document.createElement("div");
  lineLabelRow.className = "insp-row";
  const lineLabelLbl = document.createElement("label");
  lineLabelLbl.className = "insp-field-label";
  lineLabelLbl.textContent = "라벨";
  const lineLabelInp = document.createElement("input");
  lineLabelInp.type = "text";
  lineLabelInp.maxLength = 60;
  lineLabelInp.style.cssText = "width:90px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:3px 5px;background:var(--bg-input);color:var(--text-primary);";
  lineLabelInp.addEventListener("change", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === id);
      if (!o || o.type !== "line" || o.locked) return;
      if ((o.label ?? "") === lineLabelInp.value) return; // no-op → no undo entry
      o.label = lineLabelInp.value;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  lineLabelRow.appendChild(lineLabelLbl);
  lineLabelRow.appendChild(lineLabelInp);
  sec1Body.appendChild(lineLabelRow);
  const lineLabelTypeRow = makeLabelTypeRow((o) => o.type === "line");
  sec1Body.appendChild(lineLabelTypeRow.row);

  const lineLabelShowRow = document.createElement("div");
  lineLabelShowRow.className = "insp-row";
  const lineLabelShowCb = document.createElement("input");
  lineLabelShowCb.type = "checkbox";
  lineLabelShowCb.className = "insp-cb";
  const lineLabelShowLbl = document.createElement("label");
  lineLabelShowLbl.className = "insp-field-label";
  lineLabelShowLbl.textContent = "라벨 표시";
  lineLabelShowRow.appendChild(lineLabelShowCb);
  lineLabelShowRow.appendChild(lineLabelShowLbl);
  sec1Body.appendChild(lineLabelShowRow);
  lineLabelShowCb.addEventListener("change", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    if (!id) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = lineLabelShowCb.checked;
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === id);
      if (!o || o.type !== "line" || o.locked) return;
      o.labelShow = val;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });

  // ---- 라벨 반전 (Group 6 task 2): mirror the label to the opposite side of the
  // line at the same perpendicular distance. Toggles obj.labelFlip; render.js
  // (withLineLabel) flips the normal-offset sign. Only the position changes. ----
  const lineLabelFlipRow = document.createElement("div");
  lineLabelFlipRow.className = "insp-row";
  const lineLabelFlipLbl = document.createElement("label");
  lineLabelFlipLbl.className = "insp-field-label";
  lineLabelFlipLbl.textContent = ""; // align with the 라벨 column
  const lineLabelFlipBtn = document.createElement("button");
  lineLabelFlipBtn.type = "button";
  lineLabelFlipBtn.textContent = "반전";
  lineLabelFlipBtn.style.cssText = "padding:4px 10px;font-size: 11px;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  lineLabelFlipBtn.addEventListener("click", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    if (!id) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === id);
      if (!o || o.type !== "line" || o.locked) return;
      o.labelFlip = !o.labelFlip;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  lineLabelFlipRow.appendChild(lineLabelFlipLbl);
  lineLabelFlipRow.appendChild(lineLabelFlipBtn);
  sec1Body.appendChild(lineLabelFlipRow);

  // ---- 라벨 크기 (Group 6 task 6): per-line label font size in points → mm. ----
  const lineLabelSizeRow = makeLabelSizeRow((o) => o.type === "line");
  sec1Body.appendChild(lineLabelSizeRow.row);

  // ---- Dash presets + length/gap sliders (line/polyline/curve) ----
  const dashRow = document.createElement("div");
  dashRow.className = "insp-row";
  const dashLbl = document.createElement("label");
  dashLbl.className = "insp-field-label";
  dashLbl.textContent = "선 종류";
  const dashBtns = document.createElement("div");
  dashBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  // 40×24 inline-SVG line previews, keyed by preset label (constant left untouched).
  const DASH_ICONS = {
    "실선":  '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2"/>',
    "점선1": '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="4 3"/>',
    "점선2": '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="8 3"/>',
    "점선3": '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="2 2"/>',
    // 4값·6값 패턴 프리셋(mm)을 아이콘 좌표(px)로 대략 4배 확대해 보여준다.
    "일점쇄선": '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="9.6 2.4 1.2 2.4"/>',
    "이점쇄선": '<line x1="2" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="9.6 2.4 1.2 2.4 1.2 2.4"/>',
  };
  const _dashBtnEls = [];
  DASH_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.title = preset.label;
    btn.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${DASH_ICONS[preset.label] || ""}</svg>`;
    btn.style.cssText = "width:40px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
    btn.addEventListener("click", () => {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (ids.length !== 1) return;
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const o = s2.objects.find((o) => o.id === ids[0]);
        if (supportsDash(o)) {
          if (Array.isArray(preset.dashPattern)) {
            // 패턴 프리셋: dashPattern 이 켜지면 2값은 solid(0,0)로 내려 상호배타를 지킨다.
            o.dashPattern = preset.dashPattern.slice();
            o.dashLength = 0;
            o.dashGap = 0;
          } else {
            // 2값 프리셋: 패턴을 지워야 applyDash 가 기존 경로를 탄다.
            delete o.dashPattern;
            o.dashLength = preset.dashLength;
            o.dashGap = preset.dashGap;
          }
          o.partialDash = false; // selecting a normal dash preset exits 부분 점선 mode
          s2.undoStack.push(snap);
          s2.redoStack = [];
        }
      });
    });
    _dashBtnEls.push(btn);
    dashBtns.appendChild(btn);
  });

  // "부분 점선" (partial dash): half solid + half dashed. Straight line only — sets
  // obj.partialDash and seeds dashRatio/dashFlip; the dashed half reuses 길이/간격.
  const partialDashBtn = document.createElement("button");
  partialDashBtn.title = "부분 점선";
  partialDashBtn.innerHTML = '<svg width="40" height="24" viewBox="0 0 40 24">' +
    '<line x1="2" y1="12" x2="20" y2="12" stroke="#888" stroke-width="2"/>' +
    '<line x1="20" y1="12" x2="38" y2="12" stroke="#888" stroke-width="2" stroke-dasharray="3 3"/></svg>';
  partialDashBtn.style.cssText = "width:40px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  partialDashBtn.addEventListener("click", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.type === "line") {
        o.partialDash = true;
        delete o.dashPattern; // 부분 점선은 2값 경로 전용 — 패턴과 상호배타
        if ((o.dashLength ?? 0) <= 0) { o.dashLength = 0.2; o.dashGap = 0.2; } // ensure dashes show
        o.dashRatio ??= 0.5;
        o.dashFlip ??= false;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      }
    });
  });
  dashBtns.appendChild(partialDashBtn);

  dashRow.appendChild(dashLbl);
  dashRow.appendChild(dashBtns);
  sec1Body.appendChild(dashRow);

  // Length/gap sliders — visible only when a dashed preset is active (dashLength > 0).
  function makeDashSliderRow(labelText, prop) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0.2";
    range.max = "1.5";
    range.step = "0.1";
    range.className = "insp-range";
    const num = document.createElement("input");
    num.type = "number";
    num.min = "0.2";
    num.max = "1.5";
    num.step = "0.1";
    num.style.cssText = "width:40px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
    const unit = document.createElement("span");
    unit.textContent = "mm";
    unit.className = "insp-unit";
    row.appendChild(lbl);
    row.appendChild(range);
    row.appendChild(num);
    row.appendChild(unit);

    function apply(val) {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (ids.length !== 1) return;
      state.update((s2) => {
        const o = s2.objects.find((o) => o.id === ids[0]);
        if (supportsDash(o)) o[prop] = val;
      });
    }

    let _snap = null;
    range.addEventListener("mousedown", () => { _snap = snapBefore(); });
    range.addEventListener("input", () => {
      const val = parseFloat(range.value);
      num.value = val.toFixed(1);
      apply(val);
    });
    range.addEventListener("change", () => { pushSnap(_snap); _snap = null; });

    let _numSnap = null;
    num.addEventListener("focus", () => { _numSnap = snapBefore(); });
    num.addEventListener("input", () => {
      const raw = parseFloat(num.value);
      if (!isFinite(raw)) return;
      const val = Math.min(1.5, Math.max(0.2, Math.round(raw * 10) / 10));
      range.value = val;
      apply(val);
    });
    num.addEventListener("change", () => { pushSnap(_numSnap); _numSnap = null; });

    return { el: row, range, num };
  }

  const dashSliders = document.createElement("div");
  dashSliders.style.cssText = "display:flex;flex-direction:column;gap:5px;";
  const dashLenSlider = makeDashSliderRow("길이", "dashLength");
  const dashGapSlider = makeDashSliderRow("간격", "dashGap");
  dashSliders.appendChild(dashLenSlider.el);
  dashSliders.appendChild(dashGapSlider.el);
  sec1Body.appendChild(dashSliders);

  // ---- 부분 점선 전용 컨트롤: 실선 비율(0..1) + 방향 반전. 직선 한 개가 선택되고
  // partialDash가 켜졌을 때만 노출(axisVariant 전용 섹션 패턴과 동일). ----
  const partialControls = document.createElement("div");
  partialControls.style.cssText = "display:flex;flex-direction:column;gap:5px;";

  // 실선 비율 slider (dashRatio: 시작점 p1 기준 실선 비율)
  const ratioRow = document.createElement("div");
  ratioRow.className = "insp-row";
  const ratioLbl = document.createElement("label");
  ratioLbl.className = "insp-field-label";
  ratioLbl.textContent = "실선 비율";
  const ratioRange = document.createElement("input");
  ratioRange.type = "range";
  ratioRange.min = "0";
  ratioRange.max = "1";
  ratioRange.step = "0.05";
  ratioRange.className = "insp-range";
  const ratioNum = document.createElement("input");
  ratioNum.type = "number";
  ratioNum.min = "0";
  ratioNum.max = "1";
  ratioNum.step = "0.05";
  ratioNum.style.cssText = "width:40px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
  ratioRow.appendChild(ratioLbl);
  ratioRow.appendChild(ratioRange);
  ratioRow.appendChild(ratioNum);

  function applyRatio(val) {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.type === "line" && !o.locked) o.dashRatio = val; // 잠긴 객체는 실선 비율 변경 금지
    });
  }
  let _ratioSnap = null;
  ratioRange.addEventListener("mousedown", () => { _ratioSnap = snapBefore(); });
  ratioRange.addEventListener("input", () => {
    const val = Math.max(0, Math.min(1, parseFloat(ratioRange.value)));
    ratioNum.value = val.toFixed(2);
    applyRatio(val);
  });
  ratioRange.addEventListener("change", () => { pushSnap(_ratioSnap); _ratioSnap = null; });
  let _ratioNumSnap = null;
  ratioNum.addEventListener("focus", () => { _ratioNumSnap = snapBefore(); });
  ratioNum.addEventListener("input", () => {
    const raw = parseFloat(ratioNum.value);
    if (!isFinite(raw)) return;
    const val = Math.max(0, Math.min(1, raw));
    ratioRange.value = val;
    applyRatio(val);
  });
  ratioNum.addEventListener("change", () => { pushSnap(_ratioNumSnap); _ratioNumSnap = null; });
  partialControls.appendChild(ratioRow);

  // 방향 반전 button (dashFlip toggle): 실선/점선 절반을 좌우 교환.
  const flipRow = document.createElement("div");
  flipRow.className = "insp-row";
  const flipLbl = document.createElement("label");
  flipLbl.className = "insp-field-label";
  flipLbl.textContent = ""; // 라벨 컬럼 정렬 유지용 빈 칸
  const flipBtn = document.createElement("button");
  flipBtn.type = "button";
  flipBtn.textContent = "방향 반전";
  flipBtn.style.cssText = "padding:4px 10px;font-size: 11px;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  flipBtn.addEventListener("click", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.type === "line" && !o.locked) {
        o.dashFlip = !o.dashFlip;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      }
    });
  });
  flipRow.appendChild(flipLbl);
  flipRow.appendChild(flipBtn);
  partialControls.appendChild(flipRow);

  sec1Body.appendChild(partialControls);

  // ---- 닫기 toggle (single polyline only): off = open <polyline>, on = filled <polygon>.
  // Turning it on flips obj.closed; populate() then reveals the 채우기 section.
  const closeRow = document.createElement("div");
  closeRow.className = "insp-row";
  const closeCb = document.createElement("input");
  closeCb.type = "checkbox";
  closeCb.className = "insp-cb";
  const closeLbl = document.createElement("label");
  closeLbl.className = "insp-field-label";
  closeLbl.textContent = "닫기";
  closeRow.appendChild(closeCb);
  closeRow.appendChild(closeLbl);
  sec1Body.appendChild(closeRow);

  closeCb.addEventListener("change", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = snapBefore();
    const val = closeCb.checked;
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.locked) return; // 잠긴 객체는 닫기 토글 금지
      if (o && (o.type === "polyline" || o.type === "curve")) {
        s2.undoStack.push(snap);
        s2.redoStack = [];
        o.closed = val;
      }
    });
  });

  /* ---- 곡선 전용: 전선 기호 · 등치선 값 라벨 (지구과학, 2026-07-31) ----
   * 새 객체 타입을 만들지 않고 곡선의 옵션으로 둔다 — 전선도 등치선도 본질이
   * 곡선이라, 옵션으로 두면 꼭짓점을 끌어 구부리는 동작이 그대로 따라온다.
   * 렌더는 js/render/shapes.js renderCurve 가 맡는다. */
  const FRONT_KINDS = [
    ["", "없음"], ["cold", "한랭"], ["warm", "온난"],
    ["stationary", "정체"], ["occluded", "폐색"],
  ];
  const frontRow = document.createElement("div");
  frontRow.className = "insp-row";
  const frontLbl = document.createElement("label");
  frontLbl.className = "insp-field-label";
  frontLbl.textContent = "전선 기호";
  const frontSel = document.createElement("select");
  frontSel.style.cssText = "flex:1;min-width:0;font-size:12px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;background:var(--bg-input);color:var(--text-primary);";
  FRONT_KINDS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    frontSel.appendChild(o);
  });
  frontRow.append(frontLbl, frontSel);
  sec1Body.appendChild(frontRow);

  const frontGapRow = document.createElement("div");
  frontGapRow.className = "insp-row";
  const frontGapLbl = document.createElement("label");
  frontGapLbl.className = "insp-field-label";
  frontGapLbl.textContent = "기호 간격";
  const frontGapInp = document.createElement("input");
  frontGapInp.type = "number";
  frontGapInp.className = "insp-input";
  frontGapInp.min = "2"; frontGapInp.max = "40"; frontGapInp.step = "0.5";
  const frontGapUnit = document.createElement("span");
  frontGapUnit.className = "insp-unit";
  frontGapUnit.textContent = "mm";
  const frontFlipBtn = document.createElement("button");
  frontFlipBtn.textContent = "반대쪽";
  frontFlipBtn.title = "기호가 붙는 쪽을 뒤집는다";
  frontFlipBtn.style.cssText = "font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  frontGapRow.append(frontGapLbl, frontGapInp, frontGapUnit, frontFlipBtn);
  sec1Body.appendChild(frontGapRow);

  const inlineRow = document.createElement("div");
  inlineRow.className = "insp-row";
  const inlineLbl = document.createElement("label");
  inlineLbl.className = "insp-field-label";
  inlineLbl.textContent = "선 위 값";
  const inlineInp = document.createElement("input");
  inlineInp.type = "text";
  inlineInp.className = "insp-input";
  inlineInp.placeholder = "예: 1000";
  inlineInp.style.flex = "1";
  inlineRow.append(inlineLbl, inlineInp);
  sec1Body.appendChild(inlineRow);

  const inlinePosRow = document.createElement("div");
  inlinePosRow.className = "insp-row";
  const inlinePosLbl = document.createElement("label");
  inlinePosLbl.className = "insp-field-label";
  inlinePosLbl.textContent = "값 위치";
  const inlinePosRange = document.createElement("input");
  inlinePosRange.type = "range";
  inlinePosRange.className = "insp-range";
  inlinePosRange.min = "0"; inlinePosRange.max = "1"; inlinePosRange.step = "0.01";
  inlinePosRow.append(inlinePosLbl, inlinePosRange);
  sec1Body.appendChild(inlinePosRow);

  /* ---- 폴리라인 전용: 산점(점만 표시) — 지구과학 H-R도·은하 분포 ---- */
  const scatterRow = document.createElement("div");
  scatterRow.className = "insp-row";
  const scatterCb = document.createElement("input");
  scatterCb.type = "checkbox";
  scatterCb.className = "insp-cb";
  const scatterLbl = document.createElement("label");
  scatterLbl.className = "insp-field-label";
  scatterLbl.textContent = "점만 표시(산점)";
  const scatterOpenBtn = document.createElement("button");
  scatterOpenBtn.textContent = "속 빈 원";
  scatterOpenBtn.title = "점을 ● 대신 ○ 로 — 두 자료를 구분할 때";
  scatterOpenBtn.style.cssText = "font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
  scatterRow.append(scatterCb, scatterLbl, scatterOpenBtn);
  sec1Body.appendChild(scatterRow);

  const applyPolyProp = (mutate) => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = snapBefore();
    state.update((s2) => {
      const o = s2.objects.find((x) => x.id === ids[0]);
      if (!o || o.type !== "polyline" || o.locked) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
      mutate(o);
    });
  };
  scatterCb.addEventListener("change", () => applyPolyProp((o) => {
    if (scatterCb.checked) o.markerOnly = true; else delete o.markerOnly;
  }));
  scatterOpenBtn.addEventListener("click", () => applyPolyProp((o) => {
    if (o.markerOpen) delete o.markerOpen; else o.markerOpen = true;
  }));

  /* 곡선 필드 공통 반영기 — 선택이 단일 곡선일 때만 동작한다. */
  const applyCurveProp = (mutate) => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = snapBefore();
    state.update((s2) => {
      const o = s2.objects.find((x) => x.id === ids[0]);
      if (!o || o.type !== "curve" || o.locked) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
      mutate(o);
    });
  };
  frontSel.addEventListener("change", () => applyCurveProp((o) => {
    // 부재 = 기호 없음. 끌 때 필드를 지워 저장 파일을 깨끗하게 둔다.
    if (frontSel.value) o.frontKind = frontSel.value; else delete o.frontKind;
  }));
  frontGapInp.addEventListener("change", () => applyCurveProp((o) => {
    const v = parseFloat(frontGapInp.value);
    if (Number.isFinite(v) && v > 1) o.frontGap = v;
  }));
  frontFlipBtn.addEventListener("click", () => applyCurveProp((o) => {
    if (o.flipSide) delete o.flipSide; else o.flipSide = true;
  }));
  inlineInp.addEventListener("change", () => applyCurveProp((o) => {
    const v = inlineInp.value.trim();
    if (v) o.inlineLabel = v; else delete o.inlineLabel;
  }));
  inlinePosRange.addEventListener("input", () => applyCurveProp((o) => {
    o.inlineLabelT = parseFloat(inlinePosRange.value);
  }));

  // ---- 경사면처리 toggle (single polyline only): rounds interior joints at render. ----
  const roundRow = document.createElement("div");
  roundRow.className = "insp-row";
  const roundCb = document.createElement("input");
  roundCb.type = "checkbox";
  roundCb.className = "insp-cb";
  const roundLbl = document.createElement("label");
  roundLbl.className = "insp-field-label";
  roundLbl.textContent = "경사면처리";
  roundRow.appendChild(roundCb);
  roundRow.appendChild(roundLbl);
  sec1Body.appendChild(roundRow);

  roundCb.addEventListener("change", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = snapBefore();
    const val = roundCb.checked;
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (o && o.locked) return; // 잠긴 객체는 경사면처리 토글 금지
      if (o && o.type === "polyline") {
        s2.undoStack.push(snap);
        s2.redoStack = [];
        o.rounded = val;
      }
    });
  });

  // ---- 곡률 반경 (corner radius, world-unit mm): active only when 경사면처리 is on. ----
  const radiusRow = document.createElement("div");
  radiusRow.className = "insp-row";
  const radiusLbl = document.createElement("label");
  radiusLbl.className = "insp-field-label";
  radiusLbl.textContent = "곡률 반경";
  const radiusInp = document.createElement("input");
  radiusInp.type = "number";
  radiusInp.step = "1";
  radiusInp.min = "0";
  radiusInp.className = "insp-input";
  const radiusUnit = document.createElement("span");
  radiusUnit.className = "insp-unit";
  radiusUnit.textContent = "mm";
  radiusRow.appendChild(radiusLbl);
  radiusRow.appendChild(radiusInp);
  radiusRow.appendChild(radiusUnit);
  sec1Body.appendChild(radiusRow);

  function commitRadius() {
    const val = parseFloat(radiusInp.value);
    if (!isFinite(val)) return;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (!o || o.type !== "polyline" || o.locked) return;
      o.cornerRadius = Math.max(0, val);
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }
  radiusInp.addEventListener("keydown", (e) => { if (e.key === "Enter") radiusInp.blur(); });
  radiusInp.addEventListener("blur", commitRadius);

  // Highlight the active preset button (or none, for a custom slider value).
  function syncDashControls(obj) {
    const dl = obj.dashLength ?? 0;
    const dg = obj.dashGap ?? 0;
    // 패턴(일점쇄선 등)이 살아 있으면 그쪽이 활성 프리셋 — 렌더러(applyDash)의 우선순위와 같다.
    const pat = normalizeDashPattern(obj.dashPattern);
    const isPartial = obj.type === "line" && !!obj.partialDash;
    _dashBtnEls.forEach((btn, i) => {
      const p = DASH_PRESETS[i];
      // In partial mode no plain preset is the active "선 종류" (the partial button is).
      const active = !isPartial && (Array.isArray(p.dashPattern)
        ? (!!pat && p.dashPattern.length === pat.length && p.dashPattern.every((v, k) => v === pat[k]))
        : (!pat && p.dashLength === dl && p.dashGap === dg));
      btn.style.background = active ? "var(--accent)" : "var(--bg-input)";
      btn.style.color      = active ? "#ffffff" : "var(--text-primary)";
      btn.style.border     = active ? "1px solid var(--accent)" : "1px solid var(--border)";
    });
    // 부분 점선 button: shown for straight lines only; highlighted when active.
    partialDashBtn.style.display = obj.type === "line" ? "" : "none";
    partialDashBtn.style.background = isPartial ? "var(--accent)" : "var(--bg-input)";
    partialDashBtn.style.color      = isPartial ? "#ffffff" : "var(--text-primary)";
    partialDashBtn.style.border     = isPartial ? "1px solid var(--accent)" : "1px solid var(--border)";

    // 길이/간격 슬라이더는 2값 점선 전용 — 패턴이 켜져 있으면 감춘다.
    const dashed = !pat && dl > 0;
    dashSliders.style.display = dashed ? "" : "none";
    if (dashed) {
      dashLenSlider.range.value = dl; dashLenSlider.num.value = dl.toFixed(1);
      dashGapSlider.range.value = dg; dashGapSlider.num.value = dg.toFixed(1);
    }

    // 실선 비율 / 방향 반전: only for a single straight line in partial mode.
    partialControls.style.display = isPartial ? "" : "none";
    if (isPartial) {
      const r = Math.max(0, Math.min(1, obj.dashRatio ?? 0.5));
      if (document.activeElement !== ratioNum) {
        ratioRange.value = r;
        ratioNum.value = r.toFixed(2);
      }
    }
  }

  let _widthSnap = null;
  widthRange.addEventListener("mousedown", () => { _widthSnap = snapBefore(); });
  widthRange.addEventListener("input", () => {
    const val = parseFloat(widthRange.value);
    widthNum.value = val.toFixed(1);
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    state.update((s2) => {
      (s2.selectedIds || []).forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.strokeWidth = val;
      });
    });
  });
  widthRange.addEventListener("change", () => { pushSnap(_widthSnap); _widthSnap = null; });

  let _widthNumSnap = null;
  widthNum.addEventListener("focus", () => { _widthNumSnap = snapBefore(); });
  widthNum.addEventListener("input", () => {
    const raw = parseFloat(widthNum.value);
    if (!isFinite(raw)) return;
    const val = Math.min(0.5, Math.max(0.1, Math.round(raw * 10) / 10));
    widthRange.value = val;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    state.update((s2) => {
      (s2.selectedIds || []).forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.strokeWidth = val;
      });
    });
  });
  widthNum.addEventListener("change", () => { pushSnap(_widthNumSnap); _widthNumSnap = null; });

  // ---- 각도 (straight line only): set the line's angle in degrees ----
  // angle = atan2(p2.y - p1.y, p2.x - p1.x). Editing rotates the line about its
  // midpoint, preserving length. Axis-aligned angles snap to an exact horizontal
  // / vertical so 0° / 90° land precisely. One undo entry per edit.
  const angleRow = document.createElement("div");
  angleRow.className = "insp-row";
  const angleLbl = document.createElement("label");
  angleLbl.className = "insp-field-label";
  angleLbl.textContent = "각도";
  const angleInp = document.createElement("input");
  angleInp.type = "number";
  angleInp.step = "1";
  angleInp.className = "insp-input";
  const angleUnit = document.createElement("span");
  angleUnit.className = "insp-unit";
  angleUnit.textContent = "°";
  angleRow.appendChild(angleLbl);
  angleRow.appendChild(angleInp);
  angleRow.appendChild(angleUnit);
  sec1Body.appendChild(angleRow);

  function commitAngle() {
    const val = parseFloat(angleInp.value);
    if (!isFinite(val)) return;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (!o || o.type !== "line" || o.locked) return;
      const mx = (o.p1.x + o.p2.x) / 2, my = (o.p1.y + o.p2.y) / 2;
      const len = Math.hypot(o.p2.x - o.p1.x, o.p2.y - o.p1.y);
      const rad = (val * Math.PI) / 180;
      let nx = Math.cos(rad), ny = Math.sin(rad);
      const n = ((val % 360) + 360) % 360;
      if (n === 0 || n === 180) ny = 0;   // exact horizontal
      if (n === 90 || n === 270) nx = 0;  // exact vertical
      const hx = (nx * len) / 2, hy = (ny * len) / 2;
      o.p1 = { x: mx - hx, y: my - hy };
      o.p2 = { x: mx + hx, y: my + hy };
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }
  angleInp.addEventListener("keydown", (e) => { if (e.key === "Enter") angleInp.blur(); });
  angleInp.addEventListener("blur", commitAngle);

  const sec1 = makeSection("선", sec1Body);

  return {
    sec1, strokeCP, widthRange, widthNum,
    arrowRow, arrowBtn, ARROW_ICONS, MIDDLE_LEFT_ICON, lengthIcon, ARROW_CYCLE, ARROW_LABELS,
    lineModeRow, lineModeBtnEls,
    dimensionLabelRow, dimensionLabelInp, dimensionLabelTypeRow, dimensionLabelSizeRow,
    waveLengthRow, waveAmpRow, waveTailRow,
    lineLabelRow, lineLabelInp, lineLabelTypeRow, lineLabelShowRow, lineLabelShowCb,
    lineLabelFlipRow, lineLabelSizeRow,
    dashRow, _dashBtnEls, partialDashBtn, dashSliders, dashLenSlider, dashGapSlider,
    partialControls, ratioRange, ratioNum, flipBtn,
    closeRow, closeCb, roundRow, roundCb, radiusRow, radiusInp,
    frontRow, frontSel, frontGapRow, frontGapInp, inlineRow, inlineInp, inlinePosRow, inlinePosRange,
    scatterRow, scatterCb,
    angleRow, angleInp, syncDashControls,
  };
}

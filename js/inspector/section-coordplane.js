/* ===== INSPECTOR SECTION — 좌표평면 (coordplane options) =====
 * Range (xMin/xMax/yMin/yMax) · grid/tick spacing · axis-line/grid/tick/number
 * toggles · tick-number size · axis names (x/y) + label type · export on/off.
 * Follows the section-pendulum.js pattern: build DOM + wire events here; mount +
 * show/hide in js/inspector.js. Every edit goes through ctx.commitSelectedObject
 * (undo snapshot + locked/type guard). 기획서 §10-② 인스펙터. */

import { makeSection } from "./widgets.js?v=0.48.7";

const NUM_CSS = "width:52px;font-size:11px;border:1px solid #3a3c41;border-radius:3px;padding:2px 4px;text-align:center;background:#1e1f22;color:#dcddde;";

export function buildCoordplaneSection(ctx) {
  const { commitSelectedObject, makeLabelTypeRow } = ctx;
  const body = document.createElement("div");

  const applies = (o) => o && o.type === "coordplane";

  // ---- generic number input that commits o[prop] on change ----
  function makeNum(prop, { step = "1" } = {}) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = step;
    inp.style.cssText = NUM_CSS;
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      commitSelectedObject((o) => {
        if (!applies(o) || o[prop] === v) return false;
        o[prop] = v;
        return true;
      });
    });
    return inp;
  }

  // ---- a labelled row holding one or two number inputs ----
  function numRow(labelText, inputs) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    row.appendChild(lbl);
    inputs.forEach((el, i) => {
      if (i > 0 && el._sep) row.appendChild(el._sep);
      row.appendChild(el);
    });
    body.appendChild(row);
    return row;
  }
  function sep(text) { const s = document.createElement("span"); s.textContent = text; s.className = "insp-unit"; return s; }

  // ---- 형태: 십자(cross) / L자(quadrant) / 직선(single) — 옛 좌표축과 동일 ----
  const VARIANTS = [["cross", "십자"], ["quadrant", "L자"], ["single", "직선"]];
  const variantRow = document.createElement("div");
  variantRow.className = "insp-row";
  const variantLbl = document.createElement("label");
  variantLbl.className = "insp-field-label";
  variantLbl.textContent = "형태";
  variantRow.appendChild(variantLbl);
  const variantBtns = {};
  VARIANTS.forEach(([val, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText = "font-size:11px;border:1px solid #3a3c41;border-radius:3px;padding:2px 8px;margin-left:3px;background:#1e1f22;color:#dcddde;cursor:pointer;";
    b.addEventListener("click", () => {
      commitSelectedObject((o) => {
        if (!applies(o) || o.axisVariant === val) return false;
        o.axisVariant = val;
        return true;
      });
    });
    variantBtns[val] = b;
    variantRow.appendChild(b);
  });
  body.appendChild(variantRow);

  // ---- range: x [min ~ max], y [min ~ max] ----
  const xMinInp = makeNum("xMin", { step: "any" });
  const xMaxInp = makeNum("xMax", { step: "any" });
  const yMinInp = makeNum("yMin", { step: "any" });
  const yMaxInp = makeNum("yMax", { step: "any" });
  const tilde1 = sep("~"), tilde2 = sep("~");
  xMaxInp._sep = tilde1; yMaxInp._sep = tilde2;
  numRow("x 범위", [xMinInp, xMaxInp]);
  numRow("y 범위", [yMinInp, yMaxInp]);

  // ---- grid/tick spacing ----
  const gridXInp = makeNum("gridStepX", { step: "any" });
  const gridYInp = makeNum("gridStepY", { step: "any" });
  gridXInp.title = "x 간격"; gridYInp.title = "y 간격";
  const gy = gridYInp; gy._sep = sep("·");
  numRow("눈금 간격", [gridXInp, gridYInp]);

  // ---- toggle checkboxes ----
  function checkbox(labelText, prop, invertDefaultTrue = false) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "insp-cb";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    row.appendChild(cb); row.appendChild(lbl);
    body.appendChild(row);
    cb.addEventListener("change", () => {
      const val = cb.checked;
      commitSelectedObject((o) => {
        if (!applies(o) || o[prop] === val) return false;
        o[prop] = val;
        return true;
      });
    });
    return { row, cb };
  }
  const axisLinesCb = checkbox("축선", "showAxisLines");
  const gridCb = checkbox("격자", "showGrid");
  const ticksCb = checkbox("눈금", "showTicks");
  const tickLabelsCb = checkbox("숫자 라벨", "showTickLabels");

  // ---- tick-number size (shown only when 숫자 라벨 on) ----
  const tickSizeInp = makeNum("tickLabelSize", { step: "0.1" });
  const tickSizeRow = numRow("숫자 크기", [tickSizeInp]);
  const tickSizeUnit = document.createElement("span");
  tickSizeUnit.textContent = "mm"; tickSizeUnit.className = "insp-unit";
  tickSizeRow.appendChild(tickSizeUnit);

  // ---- axis names + label type ----
  function textRow(labelText, prop) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "insp-input";
    row.appendChild(lbl); row.appendChild(inp);
    body.appendChild(row);
    const commit = () => commitSelectedObject((o) => {
      if (!applies(o) || (o[prop] ?? "") === inp.value) return false;
      o[prop] = inp.value;
      return true;
    });
    inp.addEventListener("input", commit);
    inp.addEventListener("change", commit);
    return { row, inp };
  }
  const labelXRow = textRow("x축 이름", "labelX");
  const labelYRow = textRow("y축 이름", "labelY");
  const labelTypeRow = makeLabelTypeRow(applies, "quantity");
  body.appendChild(labelTypeRow.row);

  // ---- 축 이름/원점 표시 + 이름 크기 (요구: on/off + 크기조정) ----
  const axisLabelsCb = checkbox("축 이름 표시", "showAxisLabels");
  const axisLabelSizeInp = makeNum("axisLabelSize", { step: "0.1" });
  const axisLabelSizeRow = numRow("이름 크기", [axisLabelSizeInp]);
  const alsUnit = document.createElement("span");
  alsUnit.textContent = "mm"; alsUnit.className = "insp-unit";
  axisLabelSizeRow.appendChild(alsUnit);
  const originCb = checkbox("원점 O 표시", "showOrigin");

  // ---- export on/off (요구 6) ----
  const exportCb = checkbox("내보내기 포함", "exportable");

  const secCoord = makeSection("좌표평면", body);

  // ---- populate all controls from the selected coordplane ----
  function sync(obj) {
    const setNum = (inp, v) => { if (document.activeElement !== inp) inp.value = v; };
    setNum(xMinInp, obj.xMin); setNum(xMaxInp, obj.xMax);
    setNum(yMinInp, obj.yMin); setNum(yMaxInp, obj.yMax);
    setNum(gridXInp, obj.gridStepX); setNum(gridYInp, obj.gridStepY);
    axisLinesCb.cb.checked = obj.showAxisLines !== false;
    gridCb.cb.checked = obj.showGrid === true;
    ticksCb.cb.checked = obj.showTicks !== false;
    tickLabelsCb.cb.checked = obj.showTickLabels === true;
    const showNums = obj.showTickLabels === true;
    tickSizeRow.style.display = showNums ? "" : "none";
    setNum(tickSizeInp, obj.tickLabelSize ?? 2.6);
    if (document.activeElement !== labelXRow.inp) labelXRow.inp.value = obj.labelX ?? "";
    if (document.activeElement !== labelYRow.inp) labelYRow.inp.value = obj.labelY ?? "";
    labelTypeRow.sync(obj);
    axisLabelsCb.cb.checked = obj.showAxisLabels !== false;
    axisLabelSizeRow.style.display = obj.showAxisLabels !== false ? "" : "none";
    setNum(axisLabelSizeInp, obj.axisLabelSize ?? 3.5);
    originCb.cb.checked = obj.showOrigin !== false;
    exportCb.cb.checked = obj.exportable !== false;

    const av = obj.axisVariant || "cross";
    Object.entries(variantBtns).forEach(([val, b]) => {
      const on = val === av;
      b.style.background = on ? "#4a9eff" : "#1e1f22";
      b.style.borderColor = on ? "#4a9eff" : "#3a3c41";
      b.disabled = !!obj.locked;
    });

    const locked = !!obj.locked;
    [xMinInp, xMaxInp, yMinInp, yMaxInp, gridXInp, gridYInp, tickSizeInp,
     labelXRow.inp, labelYRow.inp, labelTypeRow.sel, axisLabelSizeInp,
     axisLinesCb.cb, gridCb.cb, ticksCb.cb, tickLabelsCb.cb,
     axisLabelsCb.cb, originCb.cb, exportCb.cb].forEach((el) => { el.disabled = locked; });
  }

  return { secCoord, syncCoordplane: sync };
}

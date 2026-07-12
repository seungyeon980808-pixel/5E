/* ===== INSPECTOR SECTION — 글꼴 (text font / size / italic) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { TEXT_FONTS, MIN_TEXT_PT, ptToMm, normalizeTextRunStyle } from "../state.js?v=0.56.0";
import { makeSection } from "./widgets.js?v=0.56.0";

export function buildTextSection(ctx) {
  const { state } = ctx;

  /* ---- Section (text only): 글꼴 (font family + size) ----
   * Edits the SAME obj.fontFamily / obj.fontSize fields the right-click menu uses.
   * Each change pushes one undo snapshot so Ctrl+Z reverts it. */
  const secTextBody = document.createElement("div");
  secTextBody.className = "insp-body";

  const fontFamRow = document.createElement("div");
  fontFamRow.className = "insp-row";
  const fontFamLbl = document.createElement("label");
  fontFamLbl.className = "insp-field-label";
  fontFamLbl.textContent = "글꼴";
  const fontFamSel = document.createElement("select");
  fontFamSel.style.cssText = "flex:1;min-width:0;font-size:12px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;background:var(--bg-input);color:var(--text-primary);";
  TEXT_FONTS.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.css;
    opt.textContent = f.label;
    fontFamSel.appendChild(opt);
  });
  fontFamRow.appendChild(fontFamLbl);
  fontFamRow.appendChild(fontFamSel);
  secTextBody.appendChild(fontFamRow);

  const fontSizeRow = document.createElement("div");
  fontSizeRow.className = "insp-row";
  const fontSizeLbl = document.createElement("label");
  fontSizeLbl.className = "insp-field-label";
  fontSizeLbl.textContent = "크기";
  const fontSizeNum = document.createElement("input");
  fontSizeNum.type = "number";
  fontSizeNum.min = String(MIN_TEXT_PT);
  fontSizeNum.max = "400";
  fontSizeNum.step = "1";
  fontSizeNum.style.cssText = "width:56px;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
  const fontSizeUnit = document.createElement("span");
  fontSizeUnit.textContent = "pt"; // points; stored fontSize is world-unit mm
  fontSizeUnit.className = "insp-unit";
  fontSizeRow.appendChild(fontSizeLbl);
  fontSizeRow.appendChild(fontSizeNum);
  fontSizeRow.appendChild(fontSizeUnit);
  secTextBody.appendChild(fontSizeRow);

  const italicRow = document.createElement("div");
  italicRow.className = "insp-row";
  const italicCb = document.createElement("input");
  italicCb.type = "checkbox";
  italicCb.className = "insp-cb";
  const italicLbl = document.createElement("label");
  italicLbl.className = "insp-field-label";
  italicLbl.textContent = "기울임";
  italicRow.appendChild(italicCb);
  italicRow.appendChild(italicLbl);
  secTextBody.appendChild(italicRow);

  function applyTextProp(prop, value) {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (!o || (o.type !== "text" && o.type !== "formula")) return;
      o[prop] = value;
      if (o.type === "text") o.textRuns = (o.text ?? "") ? [{ text: o.text, style: normalizeTextRunStyle(o, o) }] : [];
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }
  fontFamSel.addEventListener("change", () => applyTextProp("fontFamily", fontFamSel.value));
  italicCb.addEventListener("change", () => {
    const val = italicCb.checked;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === ids[0]);
      if (!o || (o.type !== "text" && o.type !== "formula")) return;
      o.italic = val;
      o.fontStyle = val ? "italic" : "normal";
      if (o.type === "text") o.textRuns = (o.text ?? "") ? [{ text: o.text, style: normalizeTextRunStyle(o, o) }] : [];
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  fontSizeNum.addEventListener("change", () => {
    let v = parseFloat(fontSizeNum.value); // entered in pt → store mm
    if (!isFinite(v)) return;
    v = Math.max(MIN_TEXT_PT, v);          // clamp to the 6pt floor
    fontSizeNum.value = v;                 // reflect the clamped value
    applyTextProp("fontSize", ptToMm(v));
  });
  fontSizeNum.addEventListener("keydown", (e) => { if (e.key === "Enter") fontSizeNum.blur(); });

  // 예전의 "글꼴 설정..." 버튼(별도 모달)은 제거됐다. 글꼴/크기/굵게/기울임과 심볼
  // 팔레트는 이제 통합 텍스트/라벨 편집기(더블클릭·텍스트 도구) 안에서 모두 처리한다.
  const secText = makeSection("글꼴", secTextBody);

  return { secText, fontFamSel, fontSizeNum, italicCb };
}

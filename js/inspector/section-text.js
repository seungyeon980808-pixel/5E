/* ===== INSPECTOR SECTION — 글꼴 (text font / size / italic) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { TEXT_FONTS, MIN_TEXT_PT, ptToMm, normalizeTextRunStyle,
         LETTER_SPACING_MIN, LETTER_SPACING_MAX,
         WIDTH_SCALE_MIN, WIDTH_SCALE_MAX } from "../state.js?v=1.2.0";
import { makeSection } from "./widgets.js?v=1.2.0";

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
  fontFamSel.style.cssText = "flex:1;min-width:0;font-size: 12px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;background:var(--bg-input);color:var(--text-primary);";
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
  fontSizeNum.style.cssText = "width:56px;font-size: 11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
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

  /* 자간 — em 단위(0 = 글꼴 기본). 글자 크기를 바꿔도 비율이 유지되도록 em으로 둔다.
     실측 메모: 평가원 지면(2026 수능 물리1 17번 라벨)을 돋움으로 재현해 맞춘 결과
     최적이 -0.01em, 즉 사실상 기본값이었다. 그래서 기본은 0이고 이 컨트롤은
     미세조정용이다. 범위는 좁게(-0.1 ~ 0.5em) 두어 조판이 깨지지 않게 한다. */
  const lsRow = document.createElement("div");
  lsRow.className = "insp-row";
  const lsLbl = document.createElement("label");
  lsLbl.className = "insp-field-label";
  lsLbl.textContent = "자간";
  const lsRange = document.createElement("input");
  lsRange.type = "range";
  lsRange.className = "insp-range";
  lsRange.min = String(LETTER_SPACING_MIN);
  lsRange.max = String(LETTER_SPACING_MAX);
  lsRange.step = "0.005";
  const lsNum = document.createElement("input");
  lsNum.type = "number";
  lsNum.className = "insp-input";
  lsNum.min = String(LETTER_SPACING_MIN);
  lsNum.max = String(LETTER_SPACING_MAX);
  lsNum.step = "0.005";
  const lsUnit = document.createElement("span");
  lsUnit.className = "insp-unit";
  lsUnit.textContent = "em";
  lsRow.append(lsLbl, lsRange, lsNum, lsUnit);
  secTextBody.appendChild(lsRow);

  /* 장평 — 가로 배율(%). 한글(HWP)의 "장평"과 같은 개념이고 평가원 지면이 실제로 쓰는 값이다
     (예: 신명 중고딕 장평 95%). 실측상 돋움 장평 96%에서 수능 지면과 가장 가까웠다. */
  const wsRow = document.createElement("div");
  wsRow.className = "insp-row";
  const wsLbl = document.createElement("label");
  wsLbl.className = "insp-field-label";
  wsLbl.textContent = "장평";
  const wsRange = document.createElement("input");
  wsRange.type = "range";
  wsRange.className = "insp-range";
  wsRange.min = String(Math.round(WIDTH_SCALE_MIN * 100));
  wsRange.max = String(Math.round(WIDTH_SCALE_MAX * 100));
  wsRange.step = "1";
  const wsNum = document.createElement("input");
  wsNum.type = "number";
  wsNum.className = "insp-input";
  wsNum.min = wsRange.min;
  wsNum.max = wsRange.max;
  wsNum.step = "1";
  const wsUnit = document.createElement("span");
  wsUnit.className = "insp-unit";
  wsUnit.textContent = "%";
  wsRow.append(wsLbl, wsRange, wsNum, wsUnit);
  secTextBody.appendChild(wsRow);

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

  const clampLS = (v) => Math.max(LETTER_SPACING_MIN, Math.min(LETTER_SPACING_MAX, v));
  function commitLetterSpacing(raw) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const c = clampLS(v);
    lsRange.value = String(c);
    lsNum.value = String(c);
    applyTextProp("letterSpacing", c);
  }
  lsRange.addEventListener("input", () => commitLetterSpacing(lsRange.value));
  lsNum.addEventListener("change", () => commitLetterSpacing(lsNum.value));
  lsNum.addEventListener("keydown", (e) => { if (e.key === "Enter") lsNum.blur(); });

  // 장평은 UI가 %, 저장은 배율(1 = 100%)
  function commitWidthScale(rawPct) {
    const pct = Number(rawPct);
    if (!Number.isFinite(pct)) return;
    const c = Math.max(WIDTH_SCALE_MIN * 100, Math.min(WIDTH_SCALE_MAX * 100, Math.round(pct)));
    wsRange.value = String(c);
    wsNum.value = String(c);
    applyTextProp("widthScale", c / 100);
  }
  wsRange.addEventListener("input", () => commitWidthScale(wsRange.value));
  wsNum.addEventListener("change", () => commitWidthScale(wsNum.value));
  wsNum.addEventListener("keydown", (e) => { if (e.key === "Enter") wsNum.blur(); });

  // 예전의 "글꼴 설정..." 버튼(별도 모달)은 제거됐다. 글꼴/크기/굵게/기울임과 심볼
  // 팔레트는 이제 통합 텍스트/라벨 편집기(더블클릭·텍스트 도구) 안에서 모두 처리한다.
  const secText = makeSection("글꼴", secTextBody);

  return { secText, fontFamSel, fontSizeNum, italicCb, lsRange, lsNum, wsRange, wsNum };
}

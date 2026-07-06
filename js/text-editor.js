/* ===== TEXT / FORMULA EDITING SUBSYSTEM ===== */
//
// MOVE-ONLY extraction from tools.js (v0.44.0): the unified text editor, the small
// labeler/anglearc inline editors, the standalone formula tool + inline editor, and
// the click-to-edit / F2·Enter / context-menu wiring. Behavior is byte-identical to
// the pre-extraction tools.js; the only new code is this module's own _svg/_state
// (assigned by initTextEditing, mirroring pick.js), a private _idCounter that
// replicates the exact obj-id scheme, and three small accessors (isTextEditorOpen /
// commitActiveText) plus imported isSpaceHeld to replace cross-module raw reads.

import { screenToWorld, getRenderScale, worldToScreen } from "./viewport.js?v=0.53.0";
import {
  TEXT_FONTS, DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM,
  TEXT_SIZE_PRESETS, ptToMm, mmToPt, MIN_TEXT_PT,
  EQUATION_FONT_FAMILY,
  resolveTextFontStyle, resolveTextLetterSpacing,
  normalizeTextRuns, normalizeTextRunStyle, textRunStyleFromObject, textRunsToText,
  hasStyledTextRuns, SECTION_ROMAN_STYLE, QUANTITY_STYLE,
} from "./state.js?v=0.53.0";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.53.0";
import { measureFormula, renderFormula, fontOf } from "./formula.js?v=0.53.0";
import { fillHtmlTextWithRomanRuns } from "./text-rendering.js?v=0.53.0";
import { pickSelectableObjectAtPoint } from "./pick.js?v=0.53.0";
// tools.js owns the Space-pan tracker (setupDrawing keydown/keyup). The editor only
// READS it in a few "don't act while panning" guards, so we import a getter rather
// than duplicate the tracker (which would silently diverge).
import { isSpaceHeld } from "./tools.js?v=0.53.0";

// On-screen px of the text editor (matches .text-editor-overlay font-size). Used by
// _syncEditorWidth's fallback font string; replicated here since the constant lives
// beside the drawing pipeline that stays in tools.js.
const TEXT_EDITOR_PX = 14;

let _svg = null;
let _state = null;
// New-object ids embed Date.now() so this module's counter can never collide with
// tools.js's own _idCounter (same `obj_${Date.now().toString(36)}_${++n}` scheme).
let _idCounter = 0;

/* ----- public: register the text/formula editing gestures ----- */
// Called from initTools with the live SVG root + store. Mirrors pick.js's initPick:
// stash svg/state in module scope, then register every listener the subsystem owns
// (the text tool, click-to-edit, F2/Enter shortcuts, and the right-click menu).
export function initTextEditing(svg, state) {
  _svg = svg;
  _state = state;
  setupTextTool();
  setupTextClickToEdit();
  setupTextEditShortcuts();
  setupTextContextMenu();
}

// True while the unified text/formula overlay is open. The drawing/pick code in
// tools.js (setupDrawing double-click guard) reads this instead of _textEditor.
export function isTextEditorOpen() { return _textEditor != null; }

// Commit the open text editor, if any. Route external commit requests through here
// so callers never touch _commitText / _textEditor directly.
export function commitActiveText() { if (_textEditor) _commitText(); }

/* ===== LABELER TEXT EDITOR (멀티라인 직접 입력) ============================
 * A small floating editor — same chrome as the text-tool dialog — that writes
 * straight into obj.text of a labeler. Enter inserts a newline; Ctrl+Enter (or
 * 확인) commits; Esc (or 취소) closes without changes. Korean / symbols / simple
 * formula-like strings (m, h, Q, mgh) all type directly. Opened on creation and
 * on double-click of an existing labeler (and from the inspector "편집" button). */
let _smallEditorBox = null;
let _smallEditorTextarea = null;
let _smallEditorObjId = null;
let _smallEditorType = "labeler";
let _smallEditorField = "text";

function _closeSmallEditor() {
  if (_smallEditorBox && _smallEditorBox.parentElement) _smallEditorBox.remove();
  _smallEditorBox = null;
  _smallEditorTextarea = null;
  _smallEditorObjId = null;
}

// Public entry points. Both reuse the SAME small floating editor; only the target
// object type + field (and title) differ. The labeler edits obj.text; the angle
// arc edits obj.label (its θ symbol → any text/formula-like string).
// 라벨러 입력기 = 텍스트 입력기(_openUnifiedTextEditor)와 "완전히 동일한" 편집 UI를
// 사용한다(수식 패널·LaTeX 도움말 포함 — 확정 항목 ① 재확인, 2026-07-06). 커밋
// 대상만 다르다: 수식이면 라벨러 객체의 contentMode/source/rawSource, 일반 텍스트면
// text/textRuns — 어느 쪽이든 fontFamily/labelSize는 함께 갱신된다.
export function openLabelerTextEditor(objId) {
  if (_textEditor) _commitText();
  const s = _state.get();
  const o = s.objects.find((x) => x.id === objId);
  if (!o || o.type !== "labeler") return;
  const size = o.labelSize || DEFAULT_TEXT_SIZE_MM;
  const anchor = o.p2 || o.p1 || { x: o.x || 0, y: o.y || 0 };
  const isFormula = o.contentMode === "formula" && !!(o.rawSource || o.source);
  const prefill = isFormula ? (o.rawSource || o.source) : (o.text || "");
  _openUnifiedTextEditor({
    x: anchor.x, y: anchor.y,
    text: prefill,
    source: o.rawSource || o.source || o.text || "",
    contentMode: isFormula ? "formula" : "plain",
    fontSize: size,
    fontFamily: o.fontFamily || DEFAULT_TEXT_FONT,
    fontWeight: o.fontWeight || "normal",
    fontStyle: o.italic === true ? "italic" : "normal",
    italic: o.italic === true,
    textRuns: isFormula ? undefined : normalizeTextRuns(o),
    underline: false, strikeout: false,
    rotation: o.rotation ?? 0,
    editingId: o.id,
    editingType: "labeler",
  }, 0, 0, prefill, { title: "라벨 텍스트 입력" });
}
export function openAngleArcLabelEditor(objId) {
  _openSmallTextEditor(objId, { type: "anglearc", field: "label", title: "각도 라벨/기호 입력", selectAll: true });
}

/* Insert a quick character (Roman numeral / circled consonant) into the labeler.
 * If the small editor is open, insert at the caret of its textarea (working copy);
 * otherwise append to the currently-selected labeler's committed text (one undo). */
export function insertLabelerChar(ch) {
  const s = String(ch ?? "");
  if (!s) return;
  if (_smallEditorTextarea) {
    const ta = _smallEditorTextarea;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + s + ta.value.slice(end);
    const caret = start + s.length;
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(new Event("input")); // refresh the live preview
    ta.focus();
    return;
  }
  const st = _state.get();
  const id = (st.selectedIds || [])[0];
  if (!id) return;
  const o = st.objects.find((x) => x.id === id);
  if (!o || o.type !== "labeler" || o.locked) return;
  const snap = JSON.parse(JSON.stringify(st.objects));
  _state.update((s2) => {
    const obj = s2.objects.find((x) => x.id === id);
    if (!obj || obj.type !== "labeler" || obj.locked) return;
    obj.text = (obj.text ?? "") + s;
    s2.undoStack.push(snap);
    s2.redoStack = [];
  });
}

function _openSmallTextEditor(objId, { type = "labeler", field = "text", title = "텍스트 입력", selectAll = false } = {}) {
  const s = _state.get();
  const o = s.objects.find((x) => x.id === objId);
  if (!o || o.type !== type) return;
  _closeSmallEditor();
  _smallEditorObjId = objId;
  _smallEditorType = type;
  _smallEditorField = field;

  const wrap = _svg.closest(".canvas-wrap");
  const box = document.createElement("div");
  box.className = "unified-text-editor labeler-text-editor";
  _smallEditorBox = box;

  const titleEl = document.createElement("div");
  titleEl.className = "unified-editor-title";
  titleEl.textContent = title;

  // Live preview (roman-numeral serif aware) — same separated chrome as the
  // text-tool dialog: 미리보기 on top, editable textarea below.
  const previewLabel = document.createElement("div");
  previewLabel.className = "unified-preview-label";
  previewLabel.textContent = "미리보기";
  const preview = document.createElement("div");
  preview.className = "unified-preview";

  const hint = document.createElement("div");
  hint.className = "unified-editor-hint";
  hint.textContent = "Enter 줄바꿈 · Ctrl+Enter 확인";

  const ta = document.createElement("textarea");
  ta.className = "unified-text-input labeler-text-input";
  ta.spellcheck = false;
  ta.setAttribute("autocomplete", "off");
  ta.value = o[field] ?? "";
  _smallEditorTextarea = ta;

  // labeler-only text controls live HERE (in the double-click edit dialog), NOT in
  // the inspector: 글씨체 (font family → obj.fontFamily), 글씨 크기 (size → obj.labelSize
  // in world mm), and quick-character buttons (Roman numerals + circled consonants).
  // The angle-arc editor reuses this same dialog for a short symbol, so it skips them.
  const isLabeler = type === "labeler";
  let fontSel = null, sizeInp = null, ctrlRow = null, charsRow = null;
  if (isLabeler) {
    ctrlRow = document.createElement("div");
    ctrlRow.className = "unified-editor-row";

    const fontWrap = document.createElement("label");
    fontWrap.style.cssText = "display:flex;align-items:center;gap:4px;flex:1;min-width:0;font-size:11px;color:var(--text-secondary);";
    fontWrap.append("글씨체");
    fontSel = document.createElement("select");
    fontSel.style.cssText = "flex:1;min-width:0;font-size:12px;color:var(--text-primary);background:var(--bg-canvas);border:1px solid var(--border);border-radius:5px;padding:3px 5px;";
    TEXT_FONTS.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.css; opt.textContent = f.label;
      fontSel.appendChild(opt);
    });
    fontSel.value = o.fontFamily || DEFAULT_TEXT_FONT;
    fontWrap.appendChild(fontSel);

    const sizeWrap = document.createElement("label");
    sizeWrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);";
    sizeWrap.append("글씨 크기");
    sizeInp = document.createElement("input");
    sizeInp.type = "number";
    sizeInp.min = String(MIN_TEXT_PT);
    sizeInp.max = "400";
    sizeInp.step = "1";
    sizeInp.style.cssText = "width:56px;font-size:12px;text-align:center;color:var(--text-primary);background:var(--bg-canvas);border:1px solid var(--border);border-radius:5px;padding:3px 4px;";
    sizeInp.value = Math.round(mmToPt(o.labelSize || DEFAULT_TEXT_SIZE_MM));
    sizeWrap.appendChild(sizeInp);
    const sizeUnit = document.createElement("span");
    sizeUnit.textContent = "pt";
    sizeWrap.appendChild(sizeUnit);

    ctrlRow.append(fontWrap, sizeWrap);

    charsRow = document.createElement("div");
    charsRow.className = "unified-editor-row";
    charsRow.style.flexWrap = "wrap";
    ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "㉠", "㉡", "㉢", "㉣", "㉤"].forEach((ch) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ch;
      b.title = `${ch} 삽입`;
      b.style.cssText = "min-width:28px;height:28px;padding:0 4px;font-size:14px;cursor:pointer;color:var(--text-primary);background:var(--btn-tool-bg);border:1px solid var(--border);border-radius:5px;";
      b.addEventListener("mousedown", (e) => e.preventDefault()); // keep textarea caret/focus
      b.addEventListener("click", () => insertLabelerChar(ch));
      charsRow.appendChild(b);
    });
  }

  // Live preview refresh: mirrors the canvas — roman numerals (I·II·III) render in
  // the serif/Myeongjo run (upright), and the current 글씨체/글씨 크기 apply. Uses the
  // shared fillHtmlWithRomanRuns so preview == committed SVG (same splitRomanRuns).
  const refreshPreview = () => {
    const raw = String(ta.value ?? "");
    preview.replaceChildren();
    if (!raw) return;
    const plain = document.createElement("div");
    plain.className = "plain-preview";
    plain.style.fontFamily = (fontSel ? fontSel.value : (o.fontFamily || DEFAULT_TEXT_FONT)) || DEFAULT_TEXT_FONT;
    const pt = sizeInp ? Number(sizeInp.value) : mmToPt(o.labelSize || DEFAULT_TEXT_SIZE_MM);
    plain.style.fontSize = Math.max(10, isFinite(pt) ? pt : mmToPt(DEFAULT_TEXT_SIZE_MM)) + "pt";
    plain.style.fontStyle = "normal";   // labeler/arc text is upright, never italic
    fillHtmlWithRomanRuns(plain, raw);
    preview.appendChild(plain);
  };
  ta.addEventListener("input", refreshPreview);
  if (fontSel) fontSel.addEventListener("change", refreshPreview);
  if (sizeInp) sizeInp.addEventListener("input", refreshPreview);

  const actions = document.createElement("div");
  actions.className = "unified-editor-actions";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "unified-editor-btn"; cancel.textContent = "취소";
  const ok = document.createElement("button");
  ok.type = "button"; ok.className = "unified-editor-btn primary"; ok.textContent = "확인";
  actions.append(cancel, ok);

  const commit = () => {
    const val = String(ta.value ?? "");
    const id = _smallEditorObjId;
    const ty = _smallEditorType;
    const fld = _smallEditorField;
    // labeler-only: capture 글씨체 / 글씨 크기 from the dialog (null for the arc editor).
    const fontVal = fontSel ? (fontSel.value || DEFAULT_TEXT_FONT) : null;
    let sizeMm = null;
    if (sizeInp) {
      let pt = Number(sizeInp.value);
      if (!isFinite(pt) || pt < MIN_TEXT_PT) pt = MIN_TEXT_PT;
      sizeMm = ptToMm(pt);
    }
    _closeSmallEditor();
    _state.update((st) => {
      const obj = st.objects.find((x) => x.id === id);
      if (!obj || obj.type !== ty) return;
      const textChanged = (obj[fld] ?? "") !== val;
      const fontChanged = fontVal != null && (obj.fontFamily ?? DEFAULT_TEXT_FONT) !== fontVal;
      const sizeChanged = sizeMm != null && (obj.labelSize ?? DEFAULT_TEXT_SIZE_MM) !== sizeMm;
      if (!textChanged && !fontChanged && !sizeChanged) return;
      const snap = JSON.parse(JSON.stringify(st.objects));
      obj[fld] = val;
      if (fontVal != null) obj.fontFamily = fontVal;
      if (sizeMm != null) obj.labelSize = sizeMm;
      st.undoStack.push(snap);
      st.redoStack = [];
    });
  };

  ok.addEventListener("click", commit);
  cancel.addEventListener("click", _closeSmallEditor);
  // Keep canvas shortcuts/marquee from reacting while interacting with the editor.
  box.addEventListener("mousedown", (e) => e.stopPropagation());
  ta.addEventListener("keydown", (ke) => {
    ke.stopPropagation();                                   // shield window shortcuts
    if (ke.key === "Escape") { ke.preventDefault(); _closeSmallEditor(); }
    else if (ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) { ke.preventDefault(); commit(); }
    // plain Enter → newline (native textarea behavior, multiline)
  });
  // Keyboard events from the font/size controls must not reach canvas shortcuts;
  // Ctrl+Enter / Esc still commit / cancel from anywhere in the dialog.
  box.addEventListener("keydown", (ke) => {
    ke.stopPropagation();
    if (ke.key === "Escape") { ke.preventDefault(); _closeSmallEditor(); }
    else if (ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) { ke.preventDefault(); commit(); }
  });

  // Same separated structure as the text-tool dialog: 미리보기 → 글꼴/크기 → 입력 →
  // 단축키 힌트 → 버튼. The labeler adds its font/size row + quick-char buttons.
  if (isLabeler) box.append(titleEl, previewLabel, preview, ctrlRow, ta, hint, charsRow, actions);
  else box.append(titleEl, previewLabel, preview, ta, hint, actions);
  refreshPreview();
  wrap.appendChild(box);
  const left = Math.max(0, Math.round((wrap.clientWidth - box.offsetWidth) / 2));
  const top = Math.max(0, Math.round((wrap.clientHeight - box.offsetHeight) / 2));
  box.style.left = left + "px";
  box.style.top = top + "px";
  ta.focus();
  if (selectAll) ta.select();
  else ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* ===== TEXT TOOL (T) — create, edit-in-place, font menu, font modal ===== */
//
// A native <textarea> overlay owns the glyphs, selection, IME composition, and
// caret while editing. Committed text is rendered as SVG after the overlay is
// closed. The draft carries an `editingId`: null for new text, or an existing
// object's id when re-editing it in place.
//
// Enter commits; Shift+Enter inserts a newline; ESC cancels (restoring the
// original when editing an existing object).

let _textEditor = null;     // the live capture <textarea>/<input>, or null
let _textBox = null;        // unified floating text/formula editor container
let _textPreview = null;
let _textFormulaPanel = null;
let _textFontSelect = null;
let _textSizeInput = null;
let _textItalicInput = null;
let _textBoldInput = null;
let _textFormulaMode = false;
let _textPlainOnly = false; // true for labeler edits: never treat content as formula
let _textAnchor = null;     // world-space {x,y} of the text origin
let _textCancelled = false; // set by ESC so blur doesn't double-commit
let _textSelection = { start: 0, end: 0 };
// Dev-only: flip to true to show a live selection/textRuns readout in the editor.
// Must be false for shipped builds (task requirement 5).
const _TEXT_STYLE_DEBUG = false;
let _textDebugEl = null;

function setupTextTool() {
  _svg.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (isSpaceHeld()) return;
    if (_state.get().activeTool !== "T") return;
    e.preventDefault();

    // Clicking again while an editor is open commits the current one first.
    if (_textEditor) { _commitText(); return; }

    const anchor = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const _sc = worldToScreen(_svg, _state.get().viewBox, anchor.x, anchor.y);
    // WYSIWYG: desired on-screen px → WORLD units via the TRUE render scale.
    const worldFontSize = DEFAULT_TEXT_SIZE_MM;
    _openTextEditor({
      x: anchor.x, y: anchor.y, text: "",
      source: "", contentMode: "plain",
      fontSize: worldFontSize, fontFamily: DEFAULT_TEXT_FONT,
      fontWeight: "normal", fontStyle: "normal",
      italic: false, underline: false, strikeout: false, rotation: 0,
      editingId: null,
      editingType: null,
    }, _sc.x, _sc.y, "");
  });
}

// Begin editing an EXISTING text object in place: prefill the editor with its
// content and copy ALL of its style into the draft, so the preview matches and
// the commit preserves style + id. `clickPt` = client {x,y} of the mouse click
// that opened the editor (or null for F2 / context-menu); when given, the caret
// is placed at the clicked character instead of at the end.
export function startEditingTextObject(objId, clickPt = null) {
  if (_textEditor) _commitText();
  const s = _state.get();
  const o = s.objects.find((x) => x.id === objId);
  if (!o || (o.type !== "text" && o.type !== "formula")) return;
  const sc = worldToScreen(_svg, s.viewBox, o.x, o.y);
  _openTextEditor({
    x: o.x, y: o.y,
    text: o.type === "formula" ? (o.rawSource || o.source || "") : (o.text || ""),
    source: o.rawSource || o.source || "",
    contentMode: o.type === "formula" ? "formula" : "plain",
    fontSize: o.fontSize,
    fontFamily: o.fontFamily || DEFAULT_TEXT_FONT,
    fontWeight: o.fontWeight || "normal",
    fontStyle: o.italic === true ? "italic" : "normal",
    italic: o.italic === true,
    textRuns: normalizeTextRuns(o),
    underline: !!o.underline, strikeout: !!o.strikeout,
    rotation: o.rotation ?? 0,
    editingId: o.id,
    editingType: o.type,
  }, sc.x, sc.y, o.text || "", clickPt);
}

/* ----- click → caret index: map a mouse click to the closest character index
 * in the editor overlay, so editing-by-click drops the caret where the user
 * clicked (not at the end). Measures with the SAME font as the overlay via a
 * reusable canvas, and segments Korean correctly (Intl.Segmenter → graphemes,
 * falling back to code-point iteration) so syllables are never split. */
let _measureCanvas = null;
function _measureCtx() {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  return _measureCanvas.getContext("2d");
}

// Caret index (UTF-16) in the overlay value for a client-space click point.
// A DOM text mirror is necessary because textarea contents live in a user-agent
// shadow tree that caretPositionFromPoint does not expose consistently.
function _caretIndexFromPoint(clientX, clientY) {
  if (!_textEditor) return null;

  // Chromium exposes the native textarea offset directly. This is the ideal
  // path because it is exactly the index a real click will put in selectionStart.
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos && pos.offsetNode === _textEditor) {
      return Math.max(0, Math.min(_textEditor.value.length, pos.offset));
    }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range && range.startContainer === _textEditor) {
      return Math.max(0, Math.min(_textEditor.value.length, range.startOffset));
    }
  }

  // Fallback for engines that keep textarea contents fully inside their
  // user-agent shadow tree: query an identically styled DOM text node.
  const mirror = document.createElement("div");
  mirror.className = "text-editor-overlay";
  mirror.setAttribute("aria-hidden", "true");
  mirror.textContent = _textEditor.value || "\u200b";
  mirror.style.cssText = _textEditor.style.cssText;
  mirror.style.height = _textEditor.clientHeight + "px";
  mirror.style.minWidth = "0";
  mirror.style.color = "transparent";
  mirror.style.background = "transparent";
  mirror.style.whiteSpace = "pre";
  mirror.style.overflow = "hidden";
  mirror.style.pointerEvents = "auto";
  mirror.style.zIndex = "2147483647";
  _textEditor.parentElement.appendChild(mirror);

  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }

  let index = null;
  if (node && mirror.contains(node)) {
    const before = document.createRange();
    before.setStart(mirror, 0);
    before.setEnd(node, offset);
    index = before.toString().length;
  }
  mirror.remove();
  return index == null ? null : Math.max(0, Math.min(_textEditor.value.length, index));
}

// Greek/operators/scripts inserted literally into the formula source. Roman
// numerals are intentionally NOT here: they belong to the styled symbol palette
// (_buildSymbolPalette) which inserts ASCII I/II/III as Times-serif runs, not
// plain Unicode Ⅰ/Ⅱ/Ⅲ characters.
// [보이는 글리프, 입력칸에 넣을 LaTeX] — 입력칸은 항상 LaTeX 소스를 유지한다.
const FORMULA_SYMBOLS = [
  ["θ", "\\theta"], ["λ", "\\lambda"], ["Δ", "\\Delta"], ["μ", "\\mu"], ["π", "\\pi"],
  ["→", "\\to"], ["←", "\\leftarrow"], ["±", "\\pm"], ["×", "\\times"],
  ["₀", "_0"], ["₁", "_1"], ["₂", "_2"], ["₃", "_3"], ["²", "^2"], ["³", "^3"],
];
const EDITOR_FONT_OPTIONS = [
  { label: "한글 텍스트(돋움)", css: TEXT_FONTS[0]?.css || DEFAULT_TEXT_FONT },
  { label: "수식", css: EQUATION_FONT_FAMILY },
  { label: "명조", css: "serif" },
  { label: "고딕", css: "'Malgun Gothic', sans-serif" },
];

function normalizeFormulaSource(src) {
  return String(src || "")
    .replace(/\btheta\b/g, "θ")
    .replace(/\blambda\b/g, "λ")
    .replace(/\bDelta\b/g, "Δ")
    .replace(/\bmu\b/g, "μ")
    .replace(/\bpi\b/g, "π")
    .replace(/\broman1\b/g, "Ⅰ")
    .replace(/\broman2\b/g, "Ⅱ")
    .replace(/\broman3\b/g, "Ⅲ")
    .replace(/\broman4\b/g, "Ⅳ")
    .replace(/\^(-?\d+)/g, (_m, n) => `^{${n}}`);
}

function looksLikeFormula(src) {
  // 라벨러(plainOnly) 세션은 절대 수식으로 승격하지 않는다 → 미리보기·커밋이 항상
  // 일반 텍스트(+styled run) 경로를 타서 라벨의 "mgh" 같은 문자열이 수식이 되지 않는다.
  if (_textPlainOnly) return false;
  const value = String(src || "");
  // 백슬래시 명령(\sin \theta \frac 등)이 있으면 항상 수식으로 판정한다. 이게 없으면
  // "\sin"만 입력했을 때 직전 조작(_textFormulaMode)에 따라 수식/일반을 오가던 비결정 버그가 났다.
  return _textFormulaMode || /\\[a-zA-Z]/.test(value) || /\b(frac|vec|sqrt)\s*\{/.test(value) || /[_^]/.test(value);
}

function _textValue() {
  return _textEditor ? _textEditor.value : "";
}

function _cacheTextSelection() {
  if (!_textEditor) return _textSelection;
  const len = _textEditor.value.length;
  const start = Math.max(0, Math.min(len, _textEditor.selectionStart ?? len));
  const end = Math.max(0, Math.min(len, _textEditor.selectionEnd ?? start));
  _textSelection = { start: Math.min(start, end), end: Math.max(start, end) };
  _updateTextDebug();
  return _textSelection;
}

// Re-assert the cached range onto the live textarea after a style apply so the
// highlight stays visible and the NEXT toolbar action still sees a non-empty
// range (native <select> / focus churn can otherwise collapse it to a caret).
function _restoreTextSelection() {
  if (!_textEditor) return;
  const sel = _textSelection;
  if (!sel || sel.end <= sel.start) return;
  const len = _textEditor.value.length;
  const start = Math.min(sel.start, len);
  const end = Math.min(sel.end, len);
  try { _textEditor.setSelectionRange(start, end); } catch { /* detached */ }
  _textEditor.focus();
}

// Dev-only readout: proves the editor knows the exact selection + resulting runs.
function _updateTextDebug() {
  if (!_TEXT_STYLE_DEBUG || !_textDebugEl) return;
  const sel = _textSelection || { start: 0, end: 0 };
  const dt = _state.get().draftText;
  const runs = dt ? normalizeTextRuns(dt).map((r) => ({
    text: r.text,
    font: (r.style.fontFamily || "").slice(0, 10),
    italic: r.style.italic,
    bold: r.style.fontWeight === "bold",
  })) : [];
  _textDebugEl.textContent =
    `sel: [${sel.start}, ${sel.end}) "${(_textEditor?.value || "").slice(sel.start, sel.end)}"\n` +
    `runs: ${JSON.stringify(runs)}`;
}

function _currentUnifiedStyle() {
  return {
    fontFamily: _textFontSelect?.value || DEFAULT_TEXT_FONT,
    fontSize: ptToMm(Math.max(MIN_TEXT_PT, parseFloat(_textSizeInput?.value) || mmToPt(DEFAULT_TEXT_SIZE_MM))),
    fontWeight: _textBoldInput?.getAttribute("aria-pressed") === "true" ? "bold" : "normal",
    italic: _textItalicInput?.getAttribute("aria-pressed") === "true",
    underline: false,
    strikeout: false,
  };
}

/* ----- run-list slicing: return the [start,end) character window of a run list
 * as its own run array, splitting runs at the boundaries. Preserves each run's
 * style, so styled (palette) symbols keep their font when text around them edits. */
function _sliceRuns(runs, start, end) {
  const out = [];
  let pos = 0;
  for (const r of runs) {
    const text = String(r.text ?? "");
    const rStart = pos, rEnd = pos + text.length;
    const s = Math.max(start, rStart), e = Math.min(end, rEnd);
    if (s < e) out.push({ text: text.slice(s - rStart, e - rStart), style: r.style });
    pos = rEnd;
    if (pos >= end) break;
  }
  return out;
}

// Merge/normalize a raw run list against the draft's base style (drops empties,
// coalesces adjacent same-style runs, fills missing style fields).
function _normalizeRunList(draft, list) {
  return normalizeTextRuns({ ...draft, textRuns: list });
}

/* Reconcile draft.textRuns to a new plain-text value WITHOUT discarding styled
 * runs. The old value is the runs' current text; the changed span is found via a
 * common prefix/suffix diff. Only the typed-over region is rebuilt (as a plain
 * base-style run); untouched runs — including palette-inserted symbols — survive.
 * This replaces the old flatten-to-one-run behavior that erased symbol styling. */
function _syncDraftRunsToText(draft, raw) {
  if (!draft) return;
  const runs = normalizeTextRuns(draft);
  const oldValue = textRunsToText(runs);
  const newValue = String(raw ?? "");
  if (oldValue === newValue) { draft.textRuns = runs; return; }
  const oldLen = oldValue.length, newLen = newValue.length;
  let p = 0;
  while (p < oldLen && p < newLen && oldValue[p] === newValue[p]) p++;
  let sfx = 0;
  while (sfx < (oldLen - p) && sfx < (newLen - p) &&
         oldValue[oldLen - 1 - sfx] === newValue[newLen - 1 - sfx]) sfx++;
  const head = _sliceRuns(runs, 0, p);
  const tail = _sliceRuns(runs, oldLen - sfx, oldLen);
  const midText = newValue.slice(p, newLen - sfx);
  const mid = midText ? [{ text: midText, style: textRunStyleFromObject(draft) }] : [];
  draft.textRuns = _normalizeRunList(draft, [...head, ...mid, ...tail]);
}

function _setDraftWholeTextStyle(draft, style) {
  // Re-style existing runs BEFORE mutating the object base, so role runs keep the
  // font metadata they were inserted with.
  const runs = normalizeTextRuns(draft);
  Object.assign(draft, {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? "italic" : "normal",
    italic: style.italic,
    letterSpacing: resolveTextLetterSpacing(style),
  });
  const base = normalizeTextRunStyle(style, draft);
  // Whole-text font/size/bold/italic applies to plain (role: normal) runs only.
  // Palette-inserted symbols (sectionRoman/quantity) keep their own Times font;
  // they only inherit the new size so the symbol scales with the rest of the text.
  draft.textRuns = runs.map((r) => {
    const role = (r.style && r.style.role) || "normal";
    if (role !== "normal") {
      return { text: r.text, style: { ...r.style, fontSize: base.fontSize } };
    }
    return { text: r.text, style: base };
  });
}

// 글꼴/크기/굵게/기울임을 항상 "전체 텍스트"에 적용한다. 부분(선택 글자) 서식은
// 이번 작업 범위에서 제외되었다(신뢰할 수 없어 제거).
function _applyUnifiedStyleToDraft() {
  const style = _currentUnifiedStyle();
  _state.update((s) => {
    const dt = s.draftText;
    if (!dt) return;
    const raw = _textValue();
    dt.text = raw;
    dt.source = raw;
    dt.rawSource = raw;
    dt.contentMode = looksLikeFormula(raw) ? "formula" : "plain";
    _syncDraftRunsToText(dt, raw);
    _setDraftWholeTextStyle(dt, style);
  });
  _syncEditorFont();
  _refreshUnifiedPreview();
  _restoreTextSelection();
  _updateTextDebug();
}

function _syncDraftFromUnifiedEditor() {
  const raw = _textValue();
  _state.update((s) => {
    if (!s.draftText) return;
    s.draftText.text = raw;
    s.draftText.source = raw;
    s.draftText.rawSource = raw;
    s.draftText.contentMode = looksLikeFormula(raw) ? "formula" : "plain";
    _syncDraftRunsToText(s.draftText, raw);
  });
  _refreshUnifiedPreview();
}

function _insertIntoUnifiedText(value, cursorOffset = null) {
  if (!_textEditor) return;
  const start = _textEditor.selectionStart ?? _textEditor.value.length;
  const end = _textEditor.selectionEnd ?? _textEditor.value.length;
  _textEditor.value = _textEditor.value.slice(0, start) + value + _textEditor.value.slice(end);
  const pos = start + (cursorOffset == null ? value.length : cursorOffset);
  _textEditor.setSelectionRange(pos, pos);
  _textFormulaMode = true;
  _syncDraftFromUnifiedEditor();
  _textEditor.focus();
}

// 원문자(㉠㉡…) 같은 "완성된 유니코드 글자"는 수식이 아니라 일반 텍스트다. 따라서
// _textFormulaMode을 켜지 않고, 기존 styled run은 보존하는 _syncDraftFromUnifiedEditor
// 경로로만 반영한다(=라벨/텍스트가 수식으로 승격되지 않는다).
function _insertPlainCharIntoUnifiedText(value) {
  if (!_textEditor) return;
  const start = _textEditor.selectionStart ?? _textEditor.value.length;
  const end = _textEditor.selectionEnd ?? _textEditor.value.length;
  _textEditor.value = _textEditor.value.slice(0, start) + value + _textEditor.value.slice(end);
  const pos = start + value.length;
  _textEditor.setSelectionRange(pos, pos);
  _syncDraftFromUnifiedEditor();
  _textEditor.focus();
}

function _insertFormulaTemplate(template) {
  const firstEmpty = template.indexOf("{}");
  _insertIntoUnifiedText(template, firstEmpty >= 0 ? firstEmpty + 1 : null);
}

/* ----- symbol palette: insert a STYLED run at the caret -----
 * Unlike _insertIntoUnifiedText (which drops a plain character and lets the whole
 * text share one font), this splices a run carrying its own role/font metadata
 * into draft.textRuns, so the inserted I/II/III or m/v/F/a/t renders in its Times
 * font while the surrounding Korean stays normal. The caret/selection was cached
 * on the button's mousedown (before focus moved), so we honor a selected range by
 * replacing it. Never routes through the plain-text flattener. */
function _insertStyledRun(text, symbolStyle) {
  if (!_textEditor) return;
  const draft = _state.get().draftText;
  if (!draft) return;
  const value = _textEditor.value;
  const sel = _textSelection || { start: value.length, end: value.length };
  const start = Math.max(0, Math.min(sel.start, value.length));
  const end = Math.max(start, Math.min(sel.end, value.length));

  const runs = normalizeTextRuns({ ...draft, text: value });
  const head = _sliceRuns(runs, 0, start);
  const tail = _sliceRuns(runs, end, value.length);
  const styledRun = { text: String(text), style: normalizeTextRunStyle(symbolStyle, draft) };
  const nextRuns = _normalizeRunList(draft, [...head, styledRun, ...tail]);
  const nextValue = textRunsToText(nextRuns);
  const caret = start + String(text).length;

  _state.update((s) => {
    if (!s.draftText) return;
    s.draftText.textRuns = nextRuns;
    s.draftText.text = nextValue;
    s.draftText.source = nextValue;
    s.draftText.rawSource = nextValue;
    // A styled symbol is plain-text content, never a formula — keep the plain
    // preview/commit path so the run metadata (not TeX) drives rendering.
    s.draftText.contentMode = "plain";
  });

  _textEditor.value = nextValue;
  _textEditor.rows = Math.max(1, nextValue.split("\n").length);
  _textEditor.setSelectionRange(caret, caret);
  _textSelection = { start: caret, end: caret };
  _refreshUnifiedPreview();
  _updateTextDebug();
  _textEditor.focus();
}

// Palette button that keeps the textarea's caret/selection: caches the range on
// mousedown (before the button steals focus), then inserts the styled run.
function _symbolPaletteButton(label, text, symbolStyle, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "formula-palette-btn symbol-palette-btn";
  b.textContent = label;
  b.title = title || `${label} 삽입`;
  b.addEventListener("mousedown", (e) => { e.preventDefault(); _cacheTextSelection(); });
  b.addEventListener("click", (e) => { e.preventDefault(); _insertStyledRun(text, symbolStyle); });
  return b;
}

// The symbol palette proper: 구간 번호(sectionRoman, upright Times) + 물리량
// (quantity, italic Times). Each button inserts a styled run, NOT a plain char.
function _buildSymbolPalette() {
  const panel = document.createElement("div");
  panel.className = "unified-symbol-panel";

  const romanRow = document.createElement("div");
  romanRow.className = "formula-palette-row symbol-palette-row";
  const romanTag = document.createElement("span");
  romanTag.className = "symbol-palette-tag";
  romanTag.textContent = "구간";
  romanRow.appendChild(romanTag);
  [["I", "I"], ["II", "II"], ["III", "III"]].forEach(([label, text]) =>
    romanRow.appendChild(_symbolPaletteButton(label, text, SECTION_ROMAN_STYLE, `구간 ${label} (Times 정체)`)));

  // 원문자(㉠㉡㉢㉣㉤): 보기 번호에 쓰는 완성 유니코드 글자. 라벨러/텍스트 공통으로
  // 빠르게 넣도록 팔레트 행을 둔다. 수식이 아니므로 일반 텍스트로 삽입한다.
  const circledRow = document.createElement("div");
  circledRow.className = "formula-palette-row symbol-palette-row";
  const circledTag = document.createElement("span");
  circledTag.className = "symbol-palette-tag";
  circledTag.textContent = "원문자";
  circledRow.appendChild(circledTag);
  ["㉠", "㉡", "㉢", "㉣", "㉤"].forEach((ch) => {
    const b = _fxPaletteButton(ch, () => _insertPlainCharIntoUnifiedText(ch));
    b.title = `${ch} 삽입`;
    circledRow.appendChild(b);
  });

  // 물리량(m/v/F/a/t) 팔레트는 제거됨 — 수식 글꼴로 직접 입력한다.
  panel.append(romanRow, circledRow);
  return panel;
}

function _buildUnifiedFormulaPanel() {
  const panel = document.createElement("div");
  panel.className = "unified-formula-panel";
  const structure = document.createElement("div");
  structure.className = "formula-palette-row";
  [
    ["분수", () => _insertFormulaTemplate("\\frac{}{}")],
    ["벡터", () => _insertFormulaTemplate("\\vec{}")],
    ["루트", () => _insertFormulaTemplate("\\sqrt{}")],
    ["아래첨자", () => _insertFormulaTemplate("_{}")],
    ["위첨자", () => _insertFormulaTemplate("^{}")],
  ].forEach(([label, fn]) => structure.appendChild(_fxPaletteButton(label, fn)));

  const symbols = document.createElement("div");
  symbols.className = "formula-palette-row";
  FORMULA_SYMBOLS.forEach(([glyph, ins]) => symbols.appendChild(_fxPaletteButton(glyph, () => _insertIntoUnifiedText(ins))));
  panel.append(structure, symbols);
  return panel;
}

/* ----- 수식 입력 도움말(LaTeX 문법) 버튼 + 팝오버 ----- */
let _formulaHelpPopover = null;
function _closeFormulaHelp() {
  if (_formulaHelpPopover) { _formulaHelpPopover.remove(); _formulaHelpPopover = null; }
  document.removeEventListener("pointerdown", _formulaHelpOutside, true);
}
function _formulaHelpOutside(e) {
  if (!_formulaHelpPopover) { _closeFormulaHelp(); return; }
  if (!_formulaHelpPopover.contains(e.target) && !(e.target.closest && e.target.closest(".unified-editor-help"))) {
    _closeFormulaHelp();
  }
}
function _buildFormulaHelpButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "unified-editor-help";
  btn.textContent = "?";
  btn.title = "수식 입력은 LaTeX 문법을 따릅니다";
  btn.setAttribute("aria-label", "수식 입력 도움말 (LaTeX 문법)");
  btn.style.cssText = "margin-left:auto;flex:0 0 auto;width:22px;height:22px;border-radius:50%;" +
    "border:1px solid var(--border,#555);background:transparent;color:inherit;" +
    "font-weight:700;font-size:13px;line-height:1;cursor:pointer;";
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => { e.stopPropagation(); _toggleFormulaHelp(btn); });
  return btn;
}
function _toggleFormulaHelp(anchorBtn) {
  if (_formulaHelpPopover) { _closeFormulaHelp(); return; }
  const rows = [
    ["분수", "\\frac{1}{2}"],
    ["위/아래첨자", "x^2   v_0   x^{10}"],
    ["루트 · 벡터", "\\sqrt{2}   \\vec{F}"],
    ["그리스", "\\theta \\pi \\lambda \\mu \\Delta \\omega"],
    ["함수", "\\sin \\cos \\tan \\log \\ln \\exp \\lim"],
    ["기호", "\\pm \\times \\cdot \\to \\leq \\geq \\neq \\infty"],
  ];
  const pop = document.createElement("div");
  pop.className = "unified-formula-help-popover";
  pop.style.cssText = "position:fixed;z-index:100001;max-width:340px;padding:12px 14px;" +
    "background:var(--bg-panel,#2c2c2c);color:var(--text-primary,#e8e8e8);" +
    "border:1px solid var(--border,#555);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.45);" +
    "font-family:'IBM Plex Sans KR','Noto Sans KR',sans-serif;font-size:12px;line-height:1.5;";
  let html = "<div style='font-weight:700;margin-bottom:8px'>수식 입력은 LaTeX 문법을 따릅니다</div>" +
    "<table style='border-collapse:collapse'>";
  for (const [k, v] of rows) {
    html += "<tr><td style='padding:2px 12px 2px 0;color:var(--text-secondary,#999);white-space:nowrap;vertical-align:top'>" +
      k + "</td><td style='padding:2px 0;font-family:\"IBM Plex Mono\",monospace'>" +
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</td></tr>";
  }
  html += "</table>";
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + "px";
  pop.style.right = Math.max(8, window.innerWidth - r.right) + "px";
  _formulaHelpPopover = pop;
  setTimeout(() => document.addEventListener("pointerdown", _formulaHelpOutside, true), 0);
}

function _buildUnifiedStyleControls() {
  const controls = document.createElement("div");
  controls.className = "unified-style-controls";

  const fontLabel = document.createElement("label");
  fontLabel.textContent = "글꼴";
  _textFontSelect = document.createElement("select");
  _textFontSelect.className = "unified-style-select";
  EDITOR_FONT_OPTIONS.forEach((font) => {
    const opt = document.createElement("option");
    opt.value = font.css;
    opt.textContent = font.label;
    _textFontSelect.appendChild(opt);
  });
  fontLabel.appendChild(_textFontSelect);

  const sizeLabel = document.createElement("label");
  sizeLabel.textContent = "크기";
  _textSizeInput = document.createElement("select");
  _textSizeInput.className = "unified-style-size";
  TEXT_SIZE_PRESETS.forEach((pt) => {
    const opt = document.createElement("option");
    opt.value = String(pt);
    opt.textContent = String(pt);
    _textSizeInput.appendChild(opt);
  });
  sizeLabel.appendChild(_textSizeInput);

  // 기울임 토글은 제거됨 — 수식 글꼴은 항상 이탤릭(글자)/정자(숫자)로 렌더된다.
  _textBoldInput = document.createElement("button");
  _textBoldInput.type = "button";
  _textBoldInput.className = "unified-style-toggle";
  _textBoldInput.textContent = "굵게";

  controls.append(fontLabel, sizeLabel, _textBoldInput);
  // Capture the caret range BEFORE the control steals focus. Both pointerdown and
  // mousedown fire ahead of the native <select> popup / button focus, so the range
  // the user picked is cached even when the dropdown later collapses the textarea.
  const captureBeforeFocusSteal = (e) => {
    _cacheTextSelection();
    if (e.target && e.target.closest("button")) e.preventDefault();
    e.stopPropagation();
  };
  controls.addEventListener("pointerdown", captureBeforeFocusSteal);
  controls.addEventListener("mousedown", captureBeforeFocusSteal);

  const applyStyle = () => _applyUnifiedStyleToDraft();
  _textFontSelect.addEventListener("change", applyStyle);
  _textSizeInput.addEventListener("change", applyStyle);
  _textBoldInput.addEventListener("click", () => {
    _textBoldInput.setAttribute("aria-pressed", _textBoldInput.getAttribute("aria-pressed") !== "true");
    applyStyle();
  });

  // 부분(선택 글자) 서식은 이번 작업에서 제외한다. 예전 "선택 글자에 적용" 버튼은
  // 실제로는 전체 글자에 적용되어 신뢰할 수 없었으므로 UI에서 제거했다. 글꼴/크기/
  // 굵게/기울임 컨트롤은 전체 텍스트에 일관되게 적용된다(_applyUnifiedStyleToDraft).
  const wrapper = document.createElement("div");
  wrapper.className = "unified-style-block";
  wrapper.append(controls);

  if (_TEXT_STYLE_DEBUG) {
    _textDebugEl = document.createElement("pre");
    _textDebugEl.className = "unified-style-debug";
    _textDebugEl.style.cssText =
      "margin:4px 0 0;padding:4px 6px;font:11px/1.4 monospace;white-space:pre-wrap;" +
      "background:#0d1117;color:#7ee787;border-radius:4px;max-height:70px;overflow:auto;";
    wrapper.appendChild(_textDebugEl);
  }
  return wrapper;
}

function _syncUnifiedStyleControls() {
  const dt = _state.get().draftText;
  if (!dt) return;
  if (_textFontSelect) {
    const value = dt.fontFamily || DEFAULT_TEXT_FONT;
    const hasOption = Array.from(_textFontSelect.options).some((opt) => opt.value === value);
    if (!hasOption) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = "현재 글꼴";
      _textFontSelect.appendChild(opt);
    }
    _textFontSelect.value = value;
  }
  if (_textSizeInput) {
    const pt = String(Math.round(mmToPt(dt.fontSize || DEFAULT_TEXT_SIZE_MM) * 10) / 10);
    const hasOption = Array.from(_textSizeInput.options).some((opt) => opt.value === pt);
    if (!hasOption) {
      const opt = document.createElement("option");
      opt.value = pt;
      opt.textContent = pt;
      _textSizeInput.appendChild(opt);
    }
    _textSizeInput.value = pt;
  }
  if (_textItalicInput) _textItalicInput.setAttribute("aria-pressed", dt.italic === true ? "true" : "false");
  if (_textBoldInput) _textBoldInput.setAttribute("aria-pressed", (dt.fontWeight || "normal") === "bold" ? "true" : "false");
}

/* Fill an HTML element with `str`, wrapping standalone ASCII I/II/III runs in the
 * same serif/Myeongjo style that labeler canvas text uses. */
const fillHtmlWithRomanRuns = fillHtmlTextWithRomanRuns;

function appendHtmlStyledTextRuns(parent, draft) {
  const runs = normalizeTextRuns(draft);
  runs.forEach((run) => {
    const span = document.createElement("span");
    const style = normalizeTextRunStyle(run.style || {}, draft);
    span.style.fontFamily = style.fontFamily || DEFAULT_TEXT_FONT;
    span.style.fontSize = `${Math.max(10, mmToPt(style.fontSize || draft.fontSize || DEFAULT_TEXT_SIZE_MM))}pt`;
    span.style.fontStyle = style.italic ? "italic" : "normal";
    span.style.fontWeight = style.fontWeight || "normal";
    span.style.letterSpacing = resolveTextLetterSpacing(style) || "";
    const deco = [];
    if (style.underline) deco.push("underline");
    if (style.strikeout) deco.push("line-through");
    span.style.textDecoration = deco.join(" ") || "none";
    span.textContent = run.text;
    parent.appendChild(span);
  });
}

function _refreshUnifiedPreview() {
  if (!_textPreview) return;
  const raw = _textValue();
  _textPreview.replaceChildren();
  if (!raw) return;
  const dt = _state.get().draftText || {};
  if (!looksLikeFormula(raw)) {
    const plain = document.createElement("div");
    plain.className = "plain-preview";
    plain.style.fontFamily = dt.fontFamily || DEFAULT_TEXT_FONT;
    plain.style.fontSize = `${Math.max(10, mmToPt(dt.fontSize || DEFAULT_TEXT_SIZE_MM))}pt`;
    plain.style.fontStyle = resolveTextFontStyle(dt);
    plain.style.fontWeight = dt.fontWeight || "normal";
    plain.style.letterSpacing = resolveTextLetterSpacing(dt) || "";
    // 미리보기도 커밋 렌더와 동일하게: 다중 런(실제 서식)만 런 단위로, 그 외에는
    // 일반 텍스트 경로로 "구간 I/II/III" 세리프 처리를 적용한다.
    if (hasStyledTextRuns(dt)) {
      appendHtmlStyledTextRuns(plain, dt);
    } else {
      fillHtmlWithRomanRuns(plain, raw);
    }
    _textPreview.appendChild(plain);
    return;
  }
  try {
    const src = normalizeFormulaSource(raw);
    const font = {
      family: dt.fontFamily || DEFAULT_TEXT_FONT,
      weight: dt.fontWeight || "normal",
      style: resolveTextFontStyle(dt),
    };
    const m = measureFormula(src, dt.fontSize || DEFAULT_TEXT_SIZE_MM, font);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "formula-preview-svg");
    svg.setAttribute("viewBox", `0 0 ${Math.max(m.w, 1)} ${Math.max(m.h, 1)}`);
    svg.appendChild(renderFormula({
      x: 0, y: 0, source: src,
      fontSize: dt.fontSize || DEFAULT_TEXT_SIZE_MM,
      fontFamily: dt.fontFamily || DEFAULT_TEXT_FONT,
      fontWeight: dt.fontWeight || "normal",
      italic: resolveTextFontStyle(dt) === "italic",
      letterSpacing: resolveTextLetterSpacing(dt),
    }));
    _textPreview.appendChild(svg);
  } catch (err) {
    const msg = document.createElement("div");
    msg.className = "formula-preview-error";
    msg.textContent = "수식을 미리볼 수 없습니다.";
    _textPreview.appendChild(msg);
  }
}

function _enableUnifiedEditorDrag(header) {
  let drag = null;
  header.addEventListener("mousedown", (e) => {
    if (!_textBox || e.button !== 0) return;
    e.preventDefault();
    drag = {
      x: e.clientX,
      y: e.clientY,
      left: parseFloat(_textBox.style.left) || 0,
      top: parseFloat(_textBox.style.top) || 0,
    };
  });
  window.addEventListener("mousemove", (e) => {
    if (!drag || !_textBox) return;
    const wrap = _svg.closest(".canvas-wrap");
    const maxLeft = Math.max(0, wrap.clientWidth - _textBox.offsetWidth);
    const maxTop = Math.max(0, wrap.clientHeight - _textBox.offsetHeight);
    _textBox.style.left = Math.min(maxLeft, Math.max(0, drag.left + e.clientX - drag.x)) + "px";
    _textBox.style.top = Math.min(maxTop, Math.max(0, drag.top + e.clientY - drag.y)) + "px";
  });
  window.addEventListener("mouseup", () => { drag = null; });
}

function _centerUnifiedEditor(wrap) {
  if (!_textBox || !wrap) return;
  const left = Math.max(0, Math.round((wrap.clientWidth - _textBox.offsetWidth) / 2));
  const top = Math.max(0, Math.round((wrap.clientHeight - _textBox.offsetHeight) / 2));
  _textBox.style.left = left + "px";
  _textBox.style.top = top + "px";
}

function _openUnifiedTextEditor(draft, clientX, clientY, prefill, opts = {}) {
  // plainOnly = 라벨러처럼 "절대 수식이 아닌" 편집기. 수식 패널을 숨기고 looksLikeFormula를
  // 강제로 false로 만들어 미리보기·커밋이 항상 일반 텍스트(+styled run) 경로를 타게 한다.
  _textPlainOnly = !!opts.plainOnly;
  _textAnchor = { x: draft.x, y: draft.y };
  draft.nativeEditor = true;
  if (draft.editingType === "formula") _state.update((s) => { s.editingFormulaId = draft.editingId; });
  _state.update((s) => { s.draftText = draft; });

  const wrap = _svg.closest(".canvas-wrap");
  _textCancelled = false;
  _textFormulaMode = draft.contentMode === "formula";
  _textBox = document.createElement("div");
  _textBox.className = "unified-text-editor";

  const title = document.createElement("div");
  title.className = "unified-editor-title";
  title.style.display = "flex";
  title.style.alignItems = "center";
  const titleText = document.createElement("span");
  titleText.textContent = opts.title || "텍스트 입력";
  title.appendChild(titleText);
  // 수식 도움말(LaTeX 문법) — 라벨러(plainOnly)엔 수식이 없어 생략.
  if (!_textPlainOnly) title.appendChild(_buildFormulaHelpButton());
  _enableUnifiedEditorDrag(title);

  const previewLabel = document.createElement("div");
  previewLabel.className = "unified-preview-label";
  previewLabel.textContent = "미리보기";
  _textPreview = document.createElement("div");
  _textPreview.className = "unified-preview";

  const styleControls = _buildUnifiedStyleControls();

  const row = document.createElement("div");
  row.className = "unified-editor-row";
  // A <textarea> (not <input>) so plain Enter inserts a real newline and multi-line
  // text round-trips into obj.text. Mirrors the labeler's small editor: Enter =
  // 줄바꿈, Ctrl/⌘+Enter = 확인. wrap="off" so only real \n break lines (SVG text
  // never soft-wraps, so the editor must not show breaks that aren't in the string).
  _textEditor = document.createElement("textarea");
  _textEditor.className = "unified-text-input text-formula-source-input";
  _textEditor.spellcheck = false;
  _textEditor.wrap = "off";
  _textEditor.setAttribute("autocomplete", "off");
  _textEditor.value = draft.contentMode === "formula" ? (draft.source || draft.text || "") : (draft.text || prefill || "");
  _textEditor.rows = Math.max(1, _textEditor.value.split("\n").length);
  row.append(_textEditor);

  // Discoverability: state the commit/newline keys (same wording as the labeler).
  const hint = document.createElement("div");
  hint.className = "unified-editor-hint";
  hint.textContent = "Enter 줄바꿈 · Ctrl+Enter 확인";

  // 라벨은 수식이 될 수 없으므로 수식 패널을 만들지 않는다. 심볼 팔레트(구간/물리량)는
  // 텍스트 도구와 동일하게 항상 포함한다.
  _textFormulaPanel = _textPlainOnly ? null : _buildUnifiedFormulaPanel();
  const symbolPanel = _buildSymbolPalette();

  const actions = document.createElement("div");
  actions.className = "unified-editor-actions";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "unified-editor-btn"; cancel.textContent = "취소";
  cancel.addEventListener("click", () => { _textCancelled = true; _cancelText(); });
  const ok = document.createElement("button");
  ok.type = "button"; ok.className = "unified-editor-btn primary"; ok.textContent = "확인";
  ok.addEventListener("click", () => _commitText());
  actions.append(cancel, ok);

  _textBox.append(title, previewLabel, _textPreview, styleControls, row, hint, symbolPanel);
  if (_textFormulaPanel) _textBox.append(_textFormulaPanel);
  _textBox.append(actions);
  _textBox.addEventListener("keydown", (ke) => {
    if (ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) {
      ke.preventDefault();
      _commitText();
    }
  });
  wrap.appendChild(_textBox);
  _centerUnifiedEditor(wrap);
  _syncUnifiedStyleControls();
  _syncEditorFont();
  _textEditor.focus();
  _textEditor.setSelectionRange(_textEditor.value.length, _textEditor.value.length);
  _cacheTextSelection();
  ["select", "mouseup", "pointerup", "keyup", "focus"].forEach((type) => {
    _textEditor.addEventListener(type, _cacheTextSelection);
  });
  _textEditor.addEventListener("input", () => {
    // Grow the box to the line count so multi-line drafts stay fully visible.
    _textEditor.rows = Math.max(1, _textEditor.value.split("\n").length);
    _cacheTextSelection();
    _syncDraftFromUnifiedEditor();
  });
  _textEditor.addEventListener("keydown", (ke) => {
    ke.stopPropagation();
    if (ke.key === "Escape") { ke.preventDefault(); _textCancelled = true; _cancelText(); }
    // Ctrl/⌘+Enter commits; plain Enter falls through to the textarea's native
    // newline (multiline). This matches the labeler editor so behavior is uniform.
    else if (ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) { ke.preventDefault(); _commitText(); }
  });
  _syncDraftFromUnifiedEditor();
}

// Shared: seed the draft, build the capture textarea, wire its listeners.
// clientX/clientY = screen px of the text's top-left anchor.
// caretClick = client {x,y} of the opening mouse click, or null (F2 / menu).
function _openTextEditor(draft, clientX, clientY, prefill, caretClick = null) {
  _openUnifiedTextEditor(draft, clientX, clientY, prefill);
  return;
  _textAnchor = { x: draft.x, y: draft.y };
  // While editing, the textarea renders both glyphs and caret. Keeping those in
  // one native layout is what makes selectionStart match the visible position.
  draft.nativeEditor = true;
  _state.update((s) => { s.draftText = draft; });

  const wrap = _svg.closest(".canvas-wrap");
  const wr = wrap.getBoundingClientRect();

  _textCancelled = false;
  _textEditor = document.createElement("textarea");
  _textEditor.className = "text-editor-overlay";
  // This is a capture overlay, not for proofing — kill native spellcheck so the
  // (misaligned, dpr-dependent) red underline never appears.
  _textEditor.spellcheck = false;
  _textEditor.setAttribute("autocorrect", "off");
  _textEditor.setAttribute("autocapitalize", "off");
  // SVG text wraps only at real newlines. Soft wrapping would make the editor
  // show line breaks that do not exist in the stored/rendered string.
  _textEditor.wrap = "off";
  // Half-leading must match the editor's REAL font size (set dynamically in
  // _syncEditorFont as dt.fontSize * getRenderScale()) and CSS line-height 1.4,
  // not the static TEXT_HALF_LEADING_PX (fixed px), or glyphs shift on edit.
  const _editorPx = _state.get().draftText.fontSize * getRenderScale();
  const _halfLeading = _editorPx * (1.4 - 1) / 2;   // matches CSS line-height:1.4
  _textEditor.style.left = (clientX - wr.left) + "px";
  _textEditor.style.top  = (clientY - wr.top - _halfLeading) + "px";
  _textEditor.value = prefill || "";
  _textEditor.rows = Math.max(1, (prefill || "").split("\n").length);
  _syncEditorFont();
  _textEditor.style.transformOrigin = `0 ${_halfLeading}px`;
  _textEditor.style.transform = draft.rotation ? `rotate(${draft.rotation}deg)` : "none";
  wrap.appendChild(_textEditor);
  _textEditor.focus();
  // Caret at end (not select-all) so editing existing text doesn't wipe it on
  // the first keystroke. F2 / context-menu keep this end caret.
  const _len = _textEditor.value.length;
  _textEditor.setSelectionRange(_len, _len);
  // Mouse-click editing: let the browser map its own glyph layout to an index.
  if (caretClick) {
    // Defer to the next frame so getBoundingClientRect/getComputedStyle read the
    // overlay AFTER layout (size/position settled) — otherwise the caret mapping
    // is measured against a stale box and snaps to 0/end.
    requestAnimationFrame(() => {
      if (!_textEditor) return;
      const idx = _caretIndexFromPoint(caretClick.x, caretClick.y);
      if (idx != null) _textEditor.setSelectionRange(idx, idx);
    });
  }

  _textEditor.addEventListener("input", () => {
    _textEditor.rows = Math.max(1, _textEditor.value.split("\n").length);
    _syncEditorWidth(); // keep trailing click-room past the (new) last character
    const val = _textEditor.value;
    _state.update((s) => { if (s.draftText) s.draftText.text = val; });
  });

  _textEditor.addEventListener("keydown", (ke) => {
    if (ke.key === "Escape") {
      ke.preventDefault();
      _textCancelled = true;
      _cancelText();
    } else if (ke.key === "Enter" && !ke.shiftKey) {
      ke.preventDefault();
      _commitText();
    }
    // Shift+Enter falls through → native newline in textarea
  });

  _textEditor.addEventListener("blur", (be) => {
    if (_textCancelled) return;
    // Don't commit if focus moved into the font menu/modal — those refocus the
    // editor afterwards so the draft survives the font change.
    if (be.relatedTarget && _elInTextUI(be.relatedTarget)) return;
    // A right-click (to open the font menu) also blurs the editor.
    if (_rightMouseDown) return;
    _commitText();
  });
}

// True when an element lives inside the unified text/label editor or its menu.
function _elInTextUI(el) {
  return (_textBox && _textBox.contains(el)) ||
    (_ctxMenu && _ctxMenu.contains(el));
}

// Keep the capture textarea's caret sized/styled to the draft (on-screen px).
function _syncEditorFont() {
  if (!_textEditor) return;
  const dt = _state.get().draftText;
  if (!dt) return;
  if (_textEditor.classList.contains("text-formula-source-input")) {
    _textEditor.style.fontFamily = "";
    _textEditor.style.fontSize = "";
    _textEditor.style.lineHeight = "";
    _textEditor.style.fontWeight = "";
    _textEditor.style.fontStyle = "";
    _textEditor.style.textDecoration = "";
    _textEditor.style.width = "";
    return;
  }
  _textEditor.style.fontSize   = (dt.fontSize * getRenderScale()) + "px";
  _textEditor.style.fontFamily = dt.fontFamily || DEFAULT_TEXT_FONT;
  _textEditor.style.fontWeight = dt.fontWeight || "normal";
  _textEditor.style.fontStyle  = resolveTextFontStyle(dt);
  _textEditor.style.letterSpacing = resolveTextLetterSpacing(dt) || "";
  const deco = [];
  if (dt.underline) deco.push("underline");
  if (dt.strikeout) deco.push("line-through");
  _textEditor.style.textDecoration = deco.join(" ") || "none";
  _syncEditorWidth();
}

// Grow the capture textarea to fit its widest line PLUS one trailing em, measured
// with the editor's OWN font. The textarea uses white-space:pre + overflow:hidden,
// so a fixed cols-based width clips long text and makes the region AFTER the last
// character unclickable — the user then can't drop the caret at text.length. The
// extra em guarantees a clickable insertion zone past the final glyph at any length.
function _syncEditorWidth() {
  if (!_textEditor) return;
  const st = _textEditor.style;
  const fontCss = `${st.fontStyle || "normal"} ${st.fontWeight || "normal"} ` +
    `${st.fontSize || (TEXT_EDITOR_PX + "px")} ${st.fontFamily || DEFAULT_TEXT_FONT}`;
  const ctx = _measureCtx();
  ctx.font = fontCss;
  let maxW = 0;
  for (const line of _textEditor.value.split("\n")) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const em = parseFloat(st.fontSize) || TEXT_EDITOR_PX;
  _textEditor.style.width = Math.ceil(maxW + em) + "px";
}

function _removeTextEditor() {
  if (_textBox) {
    const box = _textBox;
    _textBox = null;
    box.remove();
  }
  _textPreview = null;
  _textFormulaPanel = null;
  _textFontSelect = null;
  _textSizeInput = null;
  _textItalicInput = null;
  _textBoldInput = null;
  _textDebugEl = null;
  if (_textEditor) {
    const el = _textEditor;
    _textEditor = null; // null first to prevent blur re-entrancy
    if (el.parentElement) el.remove();
  }
  _textAnchor = null;
  _textPlainOnly = false;
  const editingId = _state.get().editingFormulaId;
  if (editingId) _state.update((s) => { s.editingFormulaId = null; });
}

// ESC / tool-switch: drop the draft, commit nothing. When editing an existing
// object, render.js stops skipping it once draftText clears → original restored.
function _cancelText() {
  _removeTextEditor();
  if (_state.get().draftText) _state.update((s) => { s.draftText = null; });
}

function _commitText() {
  if (!_textEditor) return;
  const dt = _state.get().draftText;
  const val = dt ? (dt.text ?? _textEditor.value) : _textEditor.value;
  const rawSource = String(val || "").trim();
  const isLabeler = dt && dt.editingType === "labeler";
  // 라벨러도 텍스트 도구와 동일하게 수식으로 승격될 수 있다(확정 항목 ①):
  // 수식이면 라벨러 객체에 contentMode/source/rawSource로 저장되고
  // renderLabeler가 renderFormula로 그린다.
  const formulaMode = dt && (dt.contentMode === "formula" || looksLikeFormula(rawSource));
  const normalizedSource = normalizeFormulaSource(rawSource);
  const fromTool = _state.get().activeTool === "T"; // new-text path
  _removeTextEditor();
  if (!dt) return;

  _state.update((s) => {
    if (isLabeler) {
      // 라벨러 커밋 대상: 기존 라벨러 객체(항상 editingId 존재, 새로 만들지 않음).
      // 수식 → contentMode/source/rawSource (+ text에 원문 보관: 구버전 로더 호환),
      // 일반 → text + textRuns(styled 심볼 보존). fontFamily/labelSize(mm) 공통 갱신.
      // 빈 문자열이면 원본 유지(삭제보다 복원 선호). 한 번의 undo 엔트리.
      const o = s.objects.find((x) => x.id === dt.editingId);
      if (o && o.type === "labeler" && rawSource) {
        const snap = JSON.parse(JSON.stringify(s.objects));
        s.undoStack.push(snap);
        s.redoStack = [];
        if (formulaMode) {
          o.contentMode = "formula";
          o.source = normalizedSource;
          o.rawSource = rawSource;
          o.text = rawSource;      // 구버전 로더는 이 원문을 일반 텍스트로 그림
          delete o.textRuns;
        } else {
          delete o.contentMode;
          delete o.source;
          delete o.rawSource;
          o.text = val;
          o.textRuns = normalizeTextRuns(dt);
        }
        o.fontFamily = dt.fontFamily || DEFAULT_TEXT_FONT;
        o.labelSize = dt.fontSize;
        o.fontWeight = dt.fontWeight || "normal";
        o.italic = resolveTextFontStyle(dt) === "italic";
      }
    } else if (dt.editingId) {
      // Re-edit: update the SAME object (id preserved). Empty text → keep the
      // original unchanged (prefer restore over delete). One undo entry.
      const o = s.objects.find((x) => x.id === dt.editingId);
      if (o && rawSource) {
        const snap = JSON.parse(JSON.stringify(s.objects));
        s.undoStack.push(snap);
        s.redoStack = [];
        if (formulaMode || o.type === "formula") {
          o.type = "formula";
          o.source = normalizedSource;
          o.rawSource = rawSource;
          const m = measureFormula(normalizedSource, dt.fontSize, {
            family: dt.fontFamily || DEFAULT_TEXT_FONT,
            weight: dt.fontWeight || "normal",
            style: resolveTextFontStyle(dt),
          });
          o.w = m.w; o.h = m.h;
          delete o.text;
          delete o.textRuns;
        } else {
          o.type = "text";
          o.text = val;
          o.textRuns = normalizeTextRuns(dt);
          delete o.source;
          delete o.rawSource;
          delete o.w;
          delete o.h;
        }
        o.fontSize = dt.fontSize;
        o.fontFamily = dt.fontFamily;
        o.fontWeight = dt.fontWeight;
        o.fontStyle = resolveTextFontStyle(dt);
        o.italic = resolveTextFontStyle(dt) === "italic";
        o.letterSpacing = resolveTextLetterSpacing(dt);
        o.underline = dt.underline;
        o.strikeout = dt.strikeout;
      }
    } else if (rawSource) {
      // New text built from the SAME draft data shown while typing.
      const snap = JSON.parse(JSON.stringify(s.objects));
      s.undoStack.push(snap);
      s.redoStack = [];
      const id = `obj_${Date.now().toString(36)}_${++_idCounter}`;
      const common = {
        id,
        x: dt.x, y: dt.y,
        fontSize: dt.fontSize, fontFamily: dt.fontFamily,
        fontWeight: dt.fontWeight, fontStyle: resolveTextFontStyle(dt),
        italic: resolveTextFontStyle(dt) === "italic",
        letterSpacing: resolveTextLetterSpacing(dt),
        underline: dt.underline, strikeout: dt.strikeout,
        rotation: 0, locked: false, positionLocked: false,
        layerId: s.activeLayerId, order: s.objects.length,
      };
      const next = formulaMode
        ? (() => {
            const m = measureFormula(normalizedSource, dt.fontSize, {
              family: dt.fontFamily || DEFAULT_TEXT_FONT,
              weight: dt.fontWeight || "normal",
              style: resolveTextFontStyle(dt),
            });
            return applyNewObjectStyleDefaults({
              ...common,
              type: "formula",
              source: normalizedSource,
              rawSource,
              w: m.w,
              h: m.h,
            });
          })()
        : {
            ...common,
            type: "text",
            text: val,
            textRuns: normalizeTextRuns(dt),
          };
      s.objects.push(next);
      s.selectedIds = [id];
      s.targetedId = null;
    }
    s.draftText = null;
    if (fromTool) s.activeTool = "V"; // auto-return to select after new text
  });
}

export function cancelActiveTextEditor() {
  if (!_textEditor && !_state.get().draftText) return;
  _textCancelled = true;
  _cancelText();
}

/* ===== FORMULA TOOL + INLINE EDITOR =====
 *
 * A formula is authored as a one-line brace-syntax string (see formula.js). The
 * editor is deliberately separate from the multi-line text overlay: a single
 * <input> plus a compact insertion palette, floated over the canvas at the
 * formula's screen position. Enter commits, ESC cancels. The committed object is
 * rendered as real SVG by renderObject → the editor never needs a live preview.
 *
 *   FX tool click → new formula at the click point.
 *   Double-click a formula (V tool) → re-edit it in place.
 *
 * Palette buttons insert templates with the caret dropped INSIDE the first {}
 * (mousedown-preventDefault keeps the input focused so the click never blurs it). */
let _fxInput = null;    // the live <input>, or null when idle
let _fxBox = null;      // the floating container (input + palette)
let _fxObjId = null;    // id of the formula being edited, or null for a new one
let _fxAnchor = null;   // world {x,y} top-left anchor of the formula
let _fxCancelled = false;

function setupFormulaTool() {
  _svg.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (isSpaceHeld()) return;
    if (_state.get().activeTool !== "FX") return;
    e.preventDefault();
    if (_fxInput) { commitFormulaEditor(); return; }
    const world = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    openFormulaEditor({ world });
  });
}

// Greek glyphs offered in the palette (inserted literally; the parser passes any
// non-ASCII letter through as text, so glyphs render as-is — names work too).
const FX_GREEK = ["π", "λ", "θ", "ω", "α", "β", "μ", "ρ", "φ", "Δ", "Σ", "Ω"];
const FX_ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"];

function _fxInsert(text, caretOffset) {
  if (!_fxInput) return;
  const inp = _fxInput;
  const start = inp.selectionStart ?? inp.value.length;
  const end = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, start) + text + inp.value.slice(end);
  const pos = start + (caretOffset == null ? text.length : caretOffset);
  inp.setSelectionRange(pos, pos);
  inp.focus();
}

function _fxPaletteButton(label, onClick, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "formula-palette-btn";
  b.textContent = label;
  if (title) b.title = title;
  // Keep the input focused: a normal click would blur it (committing on blur).
  b.addEventListener("mousedown", (e) => { e.preventDefault(); });
  b.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
  return b;
}

function _buildFormulaPalette() {
  const pal = document.createElement("div");
  pal.className = "formula-palette";

  const row1 = document.createElement("div");
  row1.className = "formula-palette-row";
  // "frac{" = 5 chars → caret lands inside the FIRST {}. vec{ = 4, sqrt{ = 5.
  row1.appendChild(_fxPaletteButton("a∕b", () => _fxInsert("frac{}{}", 5), "분수 frac{}{}"));
  row1.appendChild(_fxPaletteButton("√", () => _fxInsert("sqrt{}", 5), "근호 sqrt{}"));
  row1.appendChild(_fxPaletteButton("v⃗", () => _fxInsert("vec{}", 4), "벡터 vec{}"));
  row1.appendChild(_fxPaletteButton("x_n", () => _fxInsert("_{}", 2), "아래첨자 _{}"));
  row1.appendChild(_fxPaletteButton("xⁿ", () => _fxInsert("^{}", 2), "위첨자 ^{}"));
  pal.appendChild(row1);

  const row2 = document.createElement("div");
  row2.className = "formula-palette-row";
  for (const g of FX_GREEK) row2.appendChild(_fxPaletteButton(g, () => _fxInsert(g)));
  pal.appendChild(row2);

  const row3 = document.createElement("div");
  row3.className = "formula-palette-row";
  for (const r of FX_ROMAN) row3.appendChild(_fxPaletteButton(r, () => _fxInsert(r)));
  pal.appendChild(row3);

  return pal;
}

function openFormulaEditor({ objId = null, world = null }) {
  // Close any editor already open (commit it first).
  if (_fxInput) commitFormulaEditor();

  const s = _state.get();
  let source = "", x, y;
  if (objId) {
    const o = s.objects.find((obj) => obj.id === objId);
    if (!o) return;
    source = o.source || ""; x = o.x; y = o.y;
  } else if (world) {
    x = world.x; y = world.y;
  } else return;

  _fxObjId = objId;
  _fxAnchor = { x, y };
  _fxCancelled = false;

  // Hide the object being edited so its committed glyphs don't show behind the input.
  if (objId) _state.update((st) => { st.editingFormulaId = objId; });

  const sc = worldToScreen(_svg, s.viewBox, x, y);
  const wrap = _svg.closest(".canvas-wrap");
  const wr = wrap.getBoundingClientRect();

  _fxBox = document.createElement("div");
  _fxBox.className = "formula-editor";
  _fxBox.style.left = (sc.x - wr.left) + "px";
  _fxBox.style.top = (sc.y - wr.top) + "px";

  _fxInput = document.createElement("input");
  _fxInput.type = "text";
  _fxInput.className = "formula-input";
  _fxInput.spellcheck = false;
  _fxInput.setAttribute("autocomplete", "off");
  _fxInput.placeholder = "frac{T_0}{4}, vec{F}, sqrt{2} …";
  _fxInput.value = source;
  _fxBox.appendChild(_fxInput);
  _fxBox.appendChild(_buildFormulaPalette());

  wrap.appendChild(_fxBox);
  _fxInput.focus();
  _fxInput.setSelectionRange(source.length, source.length);

  _fxInput.addEventListener("keydown", (ke) => {
    ke.stopPropagation(); // don't trigger tool shortcuts while typing
    if (ke.key === "Enter") { ke.preventDefault(); commitFormulaEditor(); }
    else if (ke.key === "Escape") { ke.preventDefault(); _fxCancelled = true; teardownFormulaEditor(); }
  });
  // Clicking outside (not on a palette button — those preventDefault) commits.
  _fxInput.addEventListener("blur", () => {
    // Defer so a palette-button mousedown (which refocuses) cancels the commit.
    setTimeout(() => { if (_fxInput && document.activeElement !== _fxInput) commitFormulaEditor(); }, 0);
  });
}

function teardownFormulaEditor() {
  if (_fxBox && _fxBox.parentElement) _fxBox.remove();
  _fxBox = null;
  _fxInput = null;
  const editingId = _fxObjId;
  _fxObjId = null;
  _fxAnchor = null;
  if (_state.get().editingFormulaId === editingId) {
    _state.update((st) => { st.editingFormulaId = null; });
  }
}

function commitFormulaEditor() {
  if (!_fxInput) return;
  if (_fxCancelled) { teardownFormulaEditor(); return; }

  const src = _fxInput.value.trim();
  const objId = _fxObjId;
  const anchor = _fxAnchor;
  teardownFormulaEditor(); // remove DOM + clear editingFormulaId before the store update

  _state.update((s) => {
    if (objId) {
      // Re-edit: update the SAME object. Empty source keeps the original (prefer
      // restore over delete), mirroring the text editor's re-edit semantics.
      const o = s.objects.find((x) => x.id === objId);
      if (o && src) {
        const snap = JSON.parse(JSON.stringify(s.objects));
        s.undoStack.push(snap);
        s.redoStack = [];
        o.source = src;
        const m = measureFormula(src, o.fontSize, fontOf(o));
        o.w = m.w; o.h = m.h;
      }
    } else if (src) {
      const snap = JSON.parse(JSON.stringify(s.objects));
      s.undoStack.push(snap);
      s.redoStack = [];
      const fontSize = DEFAULT_TEXT_SIZE_MM;
      const fontFamily = DEFAULT_TEXT_FONT;
      const m = measureFormula(src, fontSize, { family: fontFamily, weight: "normal", style: "normal" });
      const id = `obj_${Date.now().toString(36)}_${++_idCounter}`;
      s.objects.push(applyNewObjectStyleDefaults({
        id,
        type: "formula",
        x: anchor.x, y: anchor.y,
        source: src,
        fontSize, fontFamily, fontWeight: "normal", italic: false,
        w: m.w, h: m.h,
        rotation: 0, locked: false, positionLocked: false,
        layerId: s.activeLayerId, order: s.objects.length,
      }));
      s.selectedIds = [id];
      s.targetedId = null;
    }
    s.activeTool = "V"; // auto-return to select (mirrors the text/new-shape flow)
  });
}

export function cancelActiveFormulaEditor() {
  if (!_fxInput) return;
  _fxCancelled = true;
  teardownFormulaEditor();
}

/* ----- CLICK-AGAIN-TO-EDIT: a no-drag click on an ALREADY-selected sole text
 * object enters edit mode (DESIGN: text is directly editable, no context menu
 * required). The first click that SELECTS a text only selects it; a subsequent
 * click on the same (already sole-selected) text opens the in-place editor.
 *
 * Implemented across mousedown→move→up so it never fires mid-drag:
 *   ??mousedown (capture, so we read the PRE-click selection before setupDrawing's
 *     bubble handler runs) arms a candidate iff exactly that one text is selected
 *     and the click lands on it.
 *   ??any real pointer movement (a drag to MOVE the text) disarms the candidate.
 *   ??a clean mouseup with the candidate still armed opens the editor.
 * Non-text objects and multi-selection never arm, so normal select/drag/resize/
 * rotate behavior is untouched. */
let _editClickId = null;     // text id armed for click-to-edit on this press, or null
let _editClickStart = null;  // {x,y} client px of the arming mousedown (drag detection)
const EDIT_CLICK_TOL_PX = 4; // pointer movement beyond this = a drag, not a click

function setupTextClickToEdit() {
  // Capture phase: read selectedIds BEFORE setupDrawing's bubble mousedown.
  _svg.addEventListener("mousedown", (e) => {
    _editClickId = null;
    _editClickStart = null;
    if (e.button !== 0) return;            // left button only
    if (isSpaceHeld()) return;              // Space+drag = pan
    if (e.detail >= 2) return;              // double-click handled in setupDrawing
    if (_textEditor) return;                // already editing
    const s = _state.get();
    if (s.activeTool !== "V") return;       // only the select tool edits-on-click
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;           // must be the SOLE selection
    const o = s.objects.find((x) => x.id === ids[0]);
    if (!o || (o.type !== "text" && o.type !== "formula")) return;    // ...and it must be a text/formula object
    // The click must actually land on THAT text (not empty space / another shape).
    const p = screenToWorld(_svg, s.viewBox, e.clientX, e.clientY);
    if (pickSelectableObjectAtPoint(s, p) !== o.id) return;
    _editClickId = o.id;
    _editClickStart = { x: e.clientX, y: e.clientY };
  }, true); // capture = true

  // A drag (moving the text) cancels the pending edit-click.
  window.addEventListener("mousemove", (e) => {
    if (!_editClickId || !_editClickStart) return;
    if (Math.hypot(e.clientX - _editClickStart.x, e.clientY - _editClickStart.y) > EDIT_CLICK_TOL_PX) {
      _editClickId = null;
      _editClickStart = null;
    }
  });

  // Clean click (no drag) on the already-selected text → enter edit mode.
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    const id = _editClickId;
    _editClickId = null;
    _editClickStart = null;
    if (id === null) return;
    if (isSpaceHeld()) return;
    const o = _state.get().objects.find((x) => x.id === id);
    if (!o || (o.type !== "text" && o.type !== "formula")) return;
    startEditingTextObject(id, { x: e.clientX, y: e.clientY });
  });
}

/* ----- F2 / Enter on a selected single text object → edit it in place ----- */
function setupTextEditShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (_textEditor) return;                                   // already editing
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key !== "F2" && e.key !== "Enter") return;
    const s = _state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const o = s.objects.find((x) => x.id === ids[0]);
    if (!o || (o.type !== "text" && o.type !== "formula")) return;
    e.preventDefault();
    startEditingTextObject(o.id);
  });
}

/* ===== TEXT CONTEXT MENU (right-click): 텍스트 수정 / 글꼴 설정... ===== */
let _ctxMenu = null;          // the floating action menu element (built lazily)
let _ctxEditItem = null;
let _ctxTarget = null;        // { kind: "object"|"draft", id }
let _rightMouseDown = false;  // true during a right-click so blur doesn't commit the draft

function _buildCtxMenu() {
  if (_ctxMenu) return;
  _ctxMenu = document.createElement("div");
  _ctxMenu.className = "text-ctx-menu";
  _ctxMenu.hidden = true;

  _ctxEditItem = document.createElement("button");
  _ctxEditItem.type = "button";
  _ctxEditItem.className = "text-ctx-item";
  _ctxEditItem.textContent = "텍스트 수정";
  _ctxEditItem.addEventListener("click", () => {
    const id = (_ctxTarget && _ctxTarget.kind === "object") ? _ctxTarget.id : null;
    _closeCtxMenu();
    if (id) startEditingTextObject(id);
  });

  // 예전의 별도 "글꼴 설정..." 항목은 제거됐다. 글꼴/크기/굵게/기울임/심볼 컨트롤이
  // 이제 통합 텍스트/라벨 편집기 안에 모두 들어 있어 별도 팝업이 필요 없다.
  _ctxMenu.appendChild(_ctxEditItem);
  document.body.appendChild(_ctxMenu);
  // Clicks inside the menu shouldn't close it via the window handler.
  _ctxMenu.addEventListener("mousedown", (e) => e.stopPropagation());
}

function _closeCtxMenu() {
  if (_ctxMenu) _ctxMenu.hidden = true;
}

function setupTextContextMenu() {
  _svg.addEventListener("contextmenu", (e) => {
    const s = _state.get();
    let target = null;

    if (s.draftText) {
      // Editing a draft (new or in-place) → tune the draft; "텍스트 수정" hidden.
      target = { kind: "draft", id: s.draftText.editingId || null };
    } else {
      const p = screenToWorld(_svg, s.viewBox, e.clientX, e.clientY);
      const hitId = pickSelectableObjectAtPoint(s, p);
      const hitObj = hitId ? s.objects.find((o) => o.id === hitId) : null;
      let obj = (hitObj && (hitObj.type === "text" || hitObj.type === "formula")) ? hitObj : null;
      if (!obj && (s.selectedIds || []).length === 1) {
        const sel = s.objects.find((o) => o.id === s.selectedIds[0]);
        if (sel && (sel.type === "text" || sel.type === "formula")) obj = sel;
      }
      if (!obj) return; // not a text target → leave the native menu alone
      target = { kind: "object", id: obj.id };
      if (!(s.selectedIds || []).includes(obj.id)) {
        _state.update((s2) => { s2.selectedIds = [obj.id]; s2.targetedId = null; });
      }
    }

    e.preventDefault(); // suppress native menu for text targets
    _buildCtxMenu();
    _ctxTarget = target;
    _ctxEditItem.style.display = target.kind === "object" ? "" : "none";
    _ctxMenu.hidden = false;
    // Position near the pointer, clamped into the viewport.
    const mw = 160, mh = 76;
    const left = Math.min(e.clientX, window.innerWidth - mw);
    const top = Math.min(e.clientY, window.innerHeight - mh);
    _ctxMenu.style.left = Math.max(4, left) + "px";
    _ctxMenu.style.top = Math.max(4, top) + "px";
  });

  // Outside click closes the menu. A right mousedown sets a short-lived flag so
  // the editor's blur handler won't commit the draft while the menu is opening.
  window.addEventListener("mousedown", (e) => {
    if (e.button === 2) { _rightMouseDown = true; setTimeout(() => { _rightMouseDown = false; }, 0); }
    if (_ctxMenu && !_ctxMenu.hidden) _closeCtxMenu();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _ctxMenu && !_ctxMenu.hidden) _closeCtxMenu();
  });
}

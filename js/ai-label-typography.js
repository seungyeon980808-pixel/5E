import {
  DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM, EQUATION_FONT_FAMILY, TEXT_FONTS,
  OBJECT_LABEL_TEXT_FONT_FAMILY, ROMAN_NUMERAL_FONT_FAMILY, splitRomanRuns, isEquationFontFamily,
} from './state.js?v=1.7.0-four-session-integration';
import { measureFormula, renderFormula, normalizeFormulaScriptStyles, getFormulaScriptSpans } from './formula.js?v=1.7.0-four-session-integration';
import { HALO_RATIO, applyGlyphHalo } from './render/core.js?v=1.7.0-four-session-integration';

export const LABEL_TYPOGRAPHY_ROLES = Object.freeze(['text', 'name', 'quantity', 'chemical', 'unit', 'number', 'symbol']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_RUNS = 32;
let measureContext;

export const LABEL_TYPOGRAPHY_PROMPT = `Typography may include fontProfile: semantic|text|name|equation, font: one exact registered font label (${TEXT_FONTS.map(f => f.label).join(', ')}), fontWeight: normal|bold, italic: boolean, letterSpacing: em number from -0.1 to 0.5, lineHeight: baseline distance/font-size from 0.8 to 2.5. Existing 5E role fonts and normal system fallback are the approved default. Exact source typeface, tracking and decorative weight matching are not required. Omit unknown cosmetic fields without declaring a label-content uncertainty solely because the source font file cannot be identified; never supply CSS/fontFamily. Unreadable text, uncertain target identity or semantic roles still require uncertainty. Nonzero tracking on formula content is unsupported; report it for review. Semantic quantity/chemical/unit runs retain their mathematical roles; explicit font choices affect ordinary text/name/symbol runs. Graph and vertical writing remain excluded.`;

export function nativePresentationForLabelTypography(typography = {}) {
  const semantic = fontForLabelRole(typography.role);
  const profile = typography.fontProfile;
  const selected = TEXT_FONTS.find(f => f.label === typography.font);
  const override = selected?.css || (profile && profile !== 'semantic' ? fontForLabelRole(profile === 'equation' ? 'quantity' : profile).fontFamily : null);
  return { ...semantic, ...(override ? { fontFamily: override, labelFontOverride: true } : {}),
    fontWeight: typography.fontWeight || 'normal',
    ...(typeof typography.italic === 'boolean' ? { italic: typography.italic, labelItalicOverride: true } : {}),
    ...(Number.isFinite(typography.letterSpacing) ? { letterSpacing: typography.letterSpacing } : {}),
    ...(Number.isFinite(typography.lineHeight) ? { labelLineHeight: typography.lineHeight } : {}) };
}

export function labelTypographyText(obj) {
  return obj.contentMode === 'formula' || obj.type === 'formula'
    ? (obj.rawSource ?? obj.source ?? obj.text ?? '') : (obj.text ?? '');
}

export function labelTypographyAngle(obj) {
  return Number(['text', 'formula'].includes(obj.type) ? obj.rotation : obj.textRotation) || 0;
}

// AI supplies semantic roles, never CSS or a second copy of the application's fonts.
export function fontForLabelRole(role) {
  if (role === 'quantity') return { fontFamily: EQUATION_FONT_FAMILY, italic: true, formulaUpright: false };
  if (['chemical', 'unit', 'number'].includes(role)) return { fontFamily: EQUATION_FONT_FAMILY, italic: false, formulaUpright: true };
  if (role === 'name') return { fontFamily: OBJECT_LABEL_TEXT_FONT_FAMILY, italic: false, formulaUpright: false };
  return { fontFamily: DEFAULT_TEXT_FONT, italic: false, formulaUpright: false };
}

// 11-07 사용자 결정(안 B): AI 라벨 복원에서 A·B·P·A₁처럼 대문자 한 글자 이름만 물체 라벨 도구와 같은 명조(OBJECT_LABEL_TEXT_FONT_FAMILY).
// 「전류 센서」 같은 한글 이름은 지금처럼 돋움, 사람이 글꼴을 바꾼 라벨은 그대로.
const OBJECT_NAME_TEXT = /^[A-Z](?:[₀-₉]+|_\{?[0-9]{1,2}\}?|[′'])?$/u;
export function isObjectNameText(text) { return OBJECT_NAME_TEXT.test(String(text ?? '').trim()); }
// 라벨 전체 글꼴을 정할 때 쓰는 종류: 이름이어도 한 글자 이름이 아니면 보통 글(돋움).
// 11-09: AI가 t₁·t₂·ε_A를 화학식(chemical)으로 잘못 줘 정체가 됐다(기출 b2_2025_11_17_1·p2_2022_06_07_1).
// 화학식은 원소 기호(대문자)로 시작하므로, 소문자·그리스 문자 하나로 시작하는 기호(+아래 첨자)는 물리량으로 본다.
const LONE_QUANTITY_SYMBOL = /^[a-zα-ωθ](?:[₀-₉ₐₑₒₓ]+|[′'])*$/u;
export function presentationRoleFor(role, text) {
  if (role === 'chemical' && /^[a-zα-ωθ](?:_|$|[₀-₉])/u.test(String(text ?? '').trim())) return 'quantity';
  return role === 'name' && !isObjectNameText(text) ? 'text' : role;
}

// 11-07 사용자 「라벨 글씨체가 엉망 — 한글·영어·영어 수식 세 가지로 나뉘어 들어가야 한다」:
// AI가 붙인 종류 이름(name·symbol 등)은 들쭉날쭉해서 A·B가 고딕이 되곤 했다. 글자 자체로 조각을 나눈다.
//   한글이 든 조각(앞뒤 괄호·문장부호 포함) → text(돋움)
//   숫자+단위(3N, 10 cm, 30°) → unit(수식 글꼴 정체)   숫자만 → number(정체)
//   AI가 물리량이라 한 영어 조각 → quantity(수식 글꼴 기울임)   AI가 화학식이라 한 조각 → chemical(정체)
//   그 밖의 영어 글자(A·B·p·q·LED) → name(명조 정체)   기호만 → text
const HANGUL = '가-힣ㄱ-ㅎㅏ-ㅣ㉠-㉻㈀-㈜';
const HANGUL_CHUNK = new RegExp(`[(\\[〈「]*[${HANGUL}]+(?:[\\s·,.~()\\[\\]〈〉]*[${HANGUL}]+)*[\\s)\\]〉」.,·]*`, 'gu');
const UNIT_AFTER_NUMBER = /^[+−-]?\d[\d.,]*\s*(?:[kmcμnMG]?(?:N|m|g|s|A|V|W|J|Pa|Hz|Ω|K|L|C|T|mol|M)|cm|mm|km|°C?|%|kg)$/u;
export function scriptLabelRuns(text, role, aiRuns) {
  const source = String(text ?? '');
  if (!source.trim() || /[_^{}\\]/.test(source)) return null; // 수식 문법 라벨은 기존 수식 경로
  const qty = new Set(), chem = new Set();
  if (role === 'quantity') qty.add('*');
  if (role === 'chemical') chem.add('*');
  for (const run of Array.isArray(aiRuns) ? aiRuns : []) {
    if (run?.role === 'quantity') qty.add(String(run.text).trim());
    if (run?.role === 'chemical') chem.add(String(run.text).trim());
  }
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(HANGUL_CHUNK)) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index), hangul: false });
    parts.push({ text: match[0], hangul: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), hangul: false });
  const runs = parts.filter(part => part.text).map(part => {
    const core = part.text.trim();
    let runRole;
    if (part.hangul || !/[A-Za-z0-9α-ωΑ-Ω]/u.test(core)) runRole = 'text';
    else if (UNIT_AFTER_NUMBER.test(core)) runRole = 'unit';
    else if (/^[+−-]?\d[\d.,]*$/.test(core)) runRole = 'number';
    else if ((chem.has('*') || [...chem].some(c => c && core.includes(c))) && LONE_QUANTITY_SYMBOL.test(core)) runRole = 'quantity';
    else if (chem.has('*') || [...chem].some(c => c && core.includes(c))) runRole = 'chemical';
    else if (qty.has('*') || qty.has(core) || [...qty].some(q => q && q !== '*' && core.includes(q)) || /[α-ωΑ-Ωθ]/u.test(core)) runRole = 'quantity';
    // AI가 일반 글자(text)로 준 영어 소문자(v, t, t₀, 3t₀, 2d)는 물리량 — 기울임. 점 이름(p·q)은 AI가 기호·이름으로 주므로 정체 그대로.
    else if ((role === 'text' || role === undefined) && /^[+−-]?\d*[a-z][a-z]?(?:[₀-₉ₐₑₒₓ]+|[′'])*$/u.test(core)) runRole = 'quantity';
    else runRole = 'name';
    return { text: part.text, role: runRole, contentMode: 'plain' };
  });
  // 11-08: 물질 상태 (l)의 l은 평가원처럼 기울임(액체). (s)·(g)·(aq)는 정체 그대로.
  const split = runs.flatMap(run => {
    if (run.role === 'text' || !/\(l\)/.test(run.text)) return [run];
    return run.text.split(/(\(l\))/).filter(Boolean).flatMap(piece => piece === '(l)'
      ? [{ text: '(', role: run.role, contentMode: 'plain' }, { text: 'l', role: 'quantity', contentMode: 'plain' }, { text: ')', role: run.role, contentMode: 'plain' }]
      : [{ ...run, text: piece }]);
  });
  return split.reduce((out, run) => {
    const prev = out[out.length - 1];
    if (prev && prev.role === run.role) prev.text += run.text; else out.push({ ...run });
    return out;
  }, []);
}

export function inferLabelRole(label) {
  const text = String(label.text || '').trim();
  if (/^[+−-]?\d+(?:[.,]\d+)*(?:°)?$/.test(text)) return 'number';
  if (/^(?:[A-Z][a-z]?[\d₀-₉]*[_^]?\{?\d*\}?)+(?:\^\{?[+−-]\}?|[⁺⁻²³]+)?(?:\([sgl]\))?$/u.test(text) && text.length > 1) return 'chemical';
  if (label.labelType === 'quantity') return 'quantity';
  // 11-06 사용자 「라벨 복원 글씨체가 망가졌다」: AI가 종류를 안 붙이면 θ·l₁·h₀까지 돋움이 됐다.
  // 한 글자 소문자·그리스 문자(아래첨자·프라임 허용)는 물리량(기울인 수식 글꼴). 대문자 한 글자(아래첨자 허용)는 물체 이름(글꼴은 라벨 도구 기본과 같게).
  if (/^(?:[a-zα-ωϑϕϵΑ-Ω])(?:[₀-₉ₐₑₒₓₔₕₖₗₘₙₚₛₜ]+|_\{?[0-9a-zA-Z]{1,3}\}?|[′'])*$/u.test(text) && !/^[Α-Ω]$/u.test(text) || /^[Δ][a-zA-Zα-ω]/u.test(text)) return 'quantity';
  if (/^[A-Z](?:[₀-₉]+|_\{?[0-9]{1,2}\}?|[′'])?$/u.test(text)) return 'name';
  if (/^[㉠-㉻ⓐ-ⓩⒶ-Ⓩ?+−-]$/.test(text)) return 'symbol';
  return 'text';
}

export function normalizeLabelTypography(value, label) {
  const role = inferLabelRole(label);
  if (value === undefined) return { typography: { role }, review: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { typography: { role }, review: true };
  let review = false;
  const typography = { role: LABEL_TYPOGRAPHY_ROLES.includes(value.role) ? value.role : role };
  if (!LABEL_TYPOGRAPHY_ROLES.includes(value.role)) review = true;
  for (const [key, valid] of Object.entries({
    fontProfile: v => ['semantic', 'text', 'name', 'equation'].includes(v),
    font: v => TEXT_FONTS.some(f => f.label === v),
    fontWeight: v => ['normal', 'bold'].includes(v),
    italic: v => typeof v === 'boolean',
    letterSpacing: v => typeof v === 'number' && Number.isFinite(v) && v >= -0.1 && v <= 0.5,
    lineHeight: v => typeof v === 'number' && Number.isFinite(v) && v >= 0.8 && v <= 2.5,
  })) {
    if (value[key] !== undefined) { if (valid(value[key])) typography[key] = value[key]; else review = true; }
  }
  if (value.fontFamily !== undefined || value.css !== undefined) review = true;
  if (typography.letterSpacing && (label.contentMode === 'formula' || (Array.isArray(value.runs) && value.runs.some(r => r?.contentMode === 'formula')))) {
    delete typography.letterSpacing; review = true;
  }
  if (value.bounds !== undefined) {
    const b = value.bounds;
    if (b && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(b[k])) && b.x >= 0 && b.y >= 0
      && b.w > 0 && b.h > 0 && b.x + b.w <= 1.000001 && b.y + b.h <= 1.000001) {
      typography.bounds = { x: b.x, y: b.y, w: b.w, h: b.h };
    } else review = true;
  }
  if (value.orientation === 'vertical') typography.orientation = 'vertical';
  else if (value.orientation !== undefined && value.orientation !== 'horizontal') review = true;
  if (value.rotation !== undefined) {
    if (Number.isFinite(value.rotation) && Math.abs(value.rotation) <= 180) typography.rotation = value.rotation;
    else review = true;
  }
  if (value.runs !== undefined) {
    const runs = value.runs;
    if (Array.isArray(runs) && runs.length > 0 && runs.length <= MAX_RUNS
      && runs.every(r => r && typeof r.text === 'string' && r.text.length > 0
        && LABEL_TYPOGRAPHY_ROLES.includes(r.role) && ['plain', 'formula'].includes(r.contentMode))
      && runs.map(r => r.text).join('') === label.text) {
      typography.runs = runs.map(r => ({ text: r.text, role: r.role, contentMode: r.contentMode }));
    } else review = true; // Keep verified text even when optional presentation metadata is invalid.
  }
  if (value.scriptStyles !== undefined) {
    const styles = value.scriptStyles;
    if (Array.isArray(styles) && styles.length <= MAX_RUNS && styles.every(s => s
      && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end > s.start
      && s.end <= label.text.length && ['sub', 'sup'].includes(s.kind) && LABEL_TYPOGRAPHY_ROLES.includes(s.role))) {
      typography.scriptStyles = normalizeFormulaScriptStyles(label.text, styles);
      if (typography.scriptStyles.length !== styles.length) review = true;
    } else review = true;
  }
  return { typography, review };
}

export async function prepareEditableLabelFonts(labels) {
  if (typeof document === 'undefined' || !document.fonts?.load || !labels?.length) return;
  const fonts = labels.flatMap(label => {
    const { typography } = normalizeLabelTypography(label.typography,label);
    // Loading must use the same defaults as createEditableImageLabelObjects.
    // Source font observations become user styles only after a manual edit.
    const base = nativePresentationForLabelTypography(label.manualStyle ? typography
      : { role:presentationRoleFor(typography.role, label.text) });
    return [base, ...(typography.runs || []).map(run => ({ ...fontForLabelRole(run.role),
      ...(base.labelFontOverride || !isEquationFontFamily(base.fontFamily)
        ? ['text','name','symbol'].includes(run.role) && !(run.role === 'name' && isObjectNameText(run.text)) ? base : {} : {}), fontWeight:base.fontWeight })),
      ...(typography.scriptStyles || []).map(style => fontForLabelRole(style.role)),
      { fontFamily:ROMAN_NUMERAL_FONT_FAMILY, italic:false }];
  });
  await Promise.all(fonts.map(async font => {
    try { await document.fonts.load(`${font.italic ? 'italic' : 'normal'} ${font.fontWeight || 'normal'} 64px ${font.fontFamily}`, '가Ag123'); }
    catch { /* System font fallback remains available when a face cannot load. */ }
  }));
  await document.fonts.ready;
}

export function hasLabelTypography(obj) {
  return obj?.labelTypographyVersion === 1;
}

// Reconcile semantic spans against a single textarea edit. The source remains
// canonical; changed script selections must still match real parsed scripts.
export function reconcileLabelTypography(obj, nextText, edit = null) {
  const oldText = obj.labelStyleText ?? labelTypographyText(obj);
  if (oldText === nextText) return { labelRuns: obj.labelRuns, labelScriptStyles: obj.labelScriptStyles };
  let start = 0, suffix = 0;
  while (start < oldText.length && start < nextText.length && oldText[start] === nextText[start]) start++;
  while (suffix < oldText.length - start && suffix < nextText.length - start
    && oldText[oldText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix++;
  let end = oldText.length - suffix, nextEnd = nextText.length - suffix;
  if (edit && !(edit.start === 0 && edit.end === oldText.length)
    && Number.isInteger(edit.start) && Number.isInteger(edit.end) && edit.start >= 0 && edit.end >= edit.start
    && oldText.slice(0, edit.start) === nextText.slice(0, edit.start)) {
    const candidateEnd = nextText.length - (oldText.length - edit.end);
    if (candidateEnd >= edit.start && oldText.slice(edit.end) === nextText.slice(candidateEnd)) {
      start = edit.start; end = edit.end; nextEnd = candidateEnd;
    }
  }
  const delta = nextEnd - end;
  const slice = (runs, from, to) => {
    let offset = 0;
    return runs.flatMap(run => {
      const a = Math.max(from, offset), b = Math.min(to, offset + run.text.length);
      const part = a < b ? [{ ...run, text: run.text.slice(a - offset, b - offset) }] : [];
      offset += run.text.length;
      return part;
    });
  };
  let labelRuns;
  const runs = obj.labelRuns;
  if (Array.isArray(runs) && runs.map(r => r.text).join('') === oldText) {
    let offset = 0, inherited = runs[0];
    for (const run of runs) {
      if (start < offset + run.text.length || start === oldText.length) inherited = run;
      if (start < offset + run.text.length) break;
      offset += run.text.length;
    }
    const middle = nextText.slice(start, nextEnd);
    labelRuns = [...slice(runs, 0, start), ...(middle ? [{ ...inherited, text: middle }] : []), ...slice(runs, end, oldText.length)]
      .reduce((out, run) => {
        const prev = out[out.length - 1];
        if (prev && prev.role === run.role && prev.contentMode === run.contentMode) prev.text += run.text;
        else out.push({ ...run });
        return out;
      }, []).map(run => ({ ...run, contentMode: /[_^](?:\{[^}]*\}|[A-Za-z0-9+−-])|(?:frac|sqrt|vec)\{/.test(run.text) ? 'formula' : run.contentMode }));
  }
  const mapped = (obj.labelScriptStyles || []).flatMap(style => {
    if (style.end <= start) return [{ ...style }];
    if (style.start >= end) return [{ ...style, start: style.start + delta, end: style.end + delta }];
    if (start >= style.start && end <= style.end) return [{ ...style, end: style.end + delta }];
    return [];
  });
  const labelScriptStyles = normalizeFormulaScriptStyles(nextText, mapped);
  return { labelRuns: labelRuns?.length ? labelRuns : undefined,
    labelScriptStyles: labelScriptStyles.length ? labelScriptStyles : undefined };
}

function plainMetrics(text, size, font) {
  if (typeof document !== 'undefined') {
    measureContext ||= document.createElement('canvas').getContext('2d');
    if (measureContext) {
      // Measure at a useful pixel size; SVG world units are millimetres, not CSS pixels.
      measureContext.font = `${font.italic ? 'italic' : 'normal'} ${font.fontWeight || 'normal'} 64px ${font.fontFamily}`;
      const m = measureContext.measureText(text);
      return { w: m.width * size / 64, ascent: (m.actualBoundingBoxAscent || 51.2) * size / 64,
        descent: Math.max(0, m.actualBoundingBoxDescent || 0) * size / 64 };
    }
  }
  const w = Array.from(text).reduce((n, ch) => n + (/[가-힣㉠-㉻ⓐ-ⓩ]/.test(ch) ? 1 : ch === ' ' ? 0.28 : 0.56), 0) * size;
  return { w, ascent: size * 0.8, descent: size * 0.2 };
}

function runMetrics(run, size) {
  const font = run.font;
  if (run.contentMode === 'formula' && typeof document !== 'undefined') {
    const m = measureFormula(run.text, size, { family: font.fontFamily, style: font.italic ? 'italic' : 'normal', weight: font.fontWeight || 'normal', forceUpright: font.formulaUpright, scriptStyles: run.scriptStyles });
    return { w: m.w, ascent: m.ascent, descent: m.descent };
  }
  return plainMetrics(run.text, size, font);
}

function plainFragments(text, font) {
  const fragments = splitRomanRuns(text).flatMap(fragment => fragment.roman ? [fragment]
    : fragment.text.split(/([Ⅰ-Ⅻⅰ-ⅻ]+)/).filter(Boolean).map(part => ({ text: part, roman: /^[Ⅰ-Ⅻⅰ-ⅻ]+$/.test(part) })));
  return fragments.flatMap(fragment => {
    if (fragment.roman) {
      const upper = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      const display = Array.from(fragment.text).map(ch => {
        const code = ch.codePointAt(0);
        if (code >= 0x2160 && code <= 0x216b) return upper[code - 0x2160];
        if (code >= 0x2170 && code <= 0x217b) return upper[code - 0x2170].toLowerCase();
        return ch;
      }).join('');
      return [{ text: display, sourceLength: fragment.text.length, font: { ...font, fontFamily: ROMAN_NUMERAL_FONT_FAMILY, italic: false } }];
    }
    if (!font.italic || !isEquationFontFamily(font.fontFamily)) return [{ text: fragment.text, font }];
    // A coefficient in 3m is upright even when the whole label is a quantity.
    return fragment.text.split(/(\d+(?:[.,]\d+)*)/).filter(Boolean).map(part => ({ text: part,
      font: /^\d/.test(part) ? { ...font, italic: false } : font }));
  });
}

// A newly typed script can cross semantic run boundaries (60 + _m). Keep its
// base and payload in one formula tree, with the payload's role carried as a
// selected-script style rather than rendering an unattached underscore.
function connectedFormulaRuns(runs, text, styles) {
  const spans = getFormulaScriptSpans(text);
  const output = [];
  const selected = [...(styles || [])];
  let offset = 0;
  for (const run of runs) {
    const previous = output[output.length - 1];
    if (previous && !previous.text.endsWith('\n') && /^[_^]/.test(run.text)) {
      previous.text += run.text;
      previous.contentMode = 'formula';
      for (const span of spans.filter(s => s.start >= offset && s.end <= offset + run.text.length)) {
        if (!selected.some(s => s.start === span.start && s.end === span.end && s.kind === span.kind)) {
          selected.push({ start: span.start, end: span.end, kind: span.kind, role: run.role || 'text' });
        }
      }
    } else output.push({ ...run });
    offset += run.text.length;
  }
  return { runs: output, styles: selected };
}

// Shared layout for canvas, picking, leader trimming, size fitting and editor preview.
export function measureLabelTypography(obj, size = obj.fontSize || obj.labelSize || DEFAULT_TEXT_SIZE_MM) {
  const text = labelTypographyText(obj);
  const baseFont = { fontFamily: obj.fontFamily || DEFAULT_TEXT_FONT, italic: obj.italic === true,
    formulaUpright: obj.formulaUpright === true, fontWeight: obj.fontWeight || 'normal' };
  const validRuns = Array.isArray(obj.labelRuns) && obj.labelRuns.length <= MAX_RUNS
    && obj.labelRuns.every(r => r && LABEL_TYPOGRAPHY_ROLES.includes(r.role) && typeof r.text === 'string'
      && ['plain', 'formula'].includes(r.contentMode)) && obj.labelRuns.map(r => r.text).join('') === text;
  // 섞인 라벨(「검출기 Q」) 안의 한 글자 이름 조각은 라벨 글꼴을 사람이 바꾸지 않았으면 명조(11-07 안 B).
  const autoFont = !obj.fontFamily || obj.fontFamily === DEFAULT_TEXT_FONT || obj.fontFamily === OBJECT_LABEL_TEXT_FONT_FAMILY;
  // 11-07: 글자로 나눈 영어 이름 조각(A·B·p·q·LED)도 명조 정체로 — 돋움으로 덮지 않는다.
  const keepName = r => r.role === 'name' && autoFont && (isObjectNameText(r.text) || obj.aiScriptRuns === true && /[A-Za-z]/.test(r.text) && !new RegExp(`[${HANGUL}]`, 'u').test(r.text));
  const initialRuns = validRuns ? obj.labelRuns.map(r => ({ ...r, font: { ...fontForLabelRole(r.role), ...((obj.labelFontOverride || obj.aiAutoLabel && !isEquationFontFamily(baseFont.fontFamily)) && ['text', 'name', 'symbol'].includes(r.role) && !keepName(r) ? baseFont : {}), ...(obj.labelItalicOverride && ['text', 'name', 'symbol'].includes(r.role) ? { italic: baseFont.italic } : {}), fontWeight: baseFont.fontWeight } }))
    : [{ text, contentMode: obj.contentMode || 'plain', font: baseFont }];
  const { runs, styles } = connectedFormulaRuns(initialRuns, text, obj.labelScriptStyles);
  const lines = [[]];
  let sourceOffset = 0;
  for (const run of runs) {
    const parts = obj.textOrient === 'vertical' && run.contentMode !== 'formula'
      ? Array.from(run.text.replace(/\n/g, '')).join('\n').split('\n') : run.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (!part) { if (i < parts.length - 1) sourceOffset += 1; return; }
      // Existing section-number policy also applies inside Korean label runs.
      const fragments = run.contentMode === 'plain' ? plainFragments(part, run.font) : [{ text: part, font: run.font }];
      for (const fragment of fragments) {
        const item = { ...run, text: fragment.text, font: fragment.font,
          scriptStyles: styles.filter(s => s.start >= sourceOffset && s.end <= sourceOffset + fragment.text.length)
            .map(s => ({ ...s, start: s.start - sourceOffset, end: s.end - sourceOffset })) };
        const tracking = run.contentMode === 'plain' && Number.isFinite(obj.letterSpacing) ? obj.letterSpacing * size : 0;
        const metrics = runMetrics(item, size);
        lines[lines.length - 1].push({ ...item, ...metrics, tracking, w: metrics.w + tracking * Array.from(item.text).length });
        sourceOffset += fragment.sourceLength ?? fragment.text.length;
      }
      if (i < parts.length - 1) sourceOffset += 1;
    });
  }
  const built = lines.map(r => ({ runs: r, w: r.reduce((n, v) => n + v.w, 0),
    ascent: Math.max(size * 0.2, ...r.map(v => v.ascent)), descent: Math.max(0, ...r.map(v => v.descent)) }));
  let baseline = 0;
  built.forEach((line, i) => {
    baseline = i === 0 ? line.ascent : baseline + (Number.isFinite(obj.labelLineHeight) ? size * obj.labelLineHeight : built[i - 1].descent + size * 0.2 + line.ascent);
    line.baseline = baseline;
  });
  const w = Math.max(size * 0.2, ...built.map(l => l.w)), h = baseline + built[built.length - 1].descent;
  const angle = labelTypographyAngle(obj) * Math.PI / 180;
  return { lines: built, w, h,
    rotatedW: Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h,
    rotatedH: Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h };
}


export function renderLabelTypography(obj, center, color = '#0d1117') {
  const size = obj.fontSize || obj.labelSize || DEFAULT_TEXT_SIZE_MM;
  const m = measureLabelTypography(obj, size);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${center.x} ${center.y}) rotate(${labelTypographyAngle(obj)})`);
  // Spaces and hollow circled glyphs must receive label clicks instead of the raster beneath.
  const hit = document.createElementNS(SVG_NS, 'rect');
  hit.setAttribute('x', -m.w / 2); hit.setAttribute('y', -m.h / 2);
  hit.setAttribute('width', m.w); hit.setAttribute('height', m.h);
  hit.setAttribute('fill', 'transparent');
  g.appendChild(hit);
  for (const line of m.lines) {
    let x = -line.w / 2;
    const baseline = line.baseline - m.h / 2;
    for (const run of line.runs) {
      if (run.contentMode === 'formula') {
        const part = renderFormula({ source: run.text, x, y: baseline - run.ascent, fontSize: size,
          fontFamily: run.font.fontFamily, italic: run.font.italic, forceUpright: run.font.formulaUpright, fontWeight: run.font.fontWeight, scriptStyles: run.scriptStyles, halo: false });
        part.querySelectorAll('rect[fill="transparent"]').forEach(el => el.remove());
        part.querySelectorAll('text, tspan').forEach(el => el.setAttribute('fill', color));
        g.appendChild(part);
      } else {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', baseline);
        t.setAttribute('font-size', size); t.setAttribute('font-family', run.font.fontFamily);
        t.setAttribute('font-style', run.font.italic ? 'italic' : 'normal');
        t.setAttribute('font-weight', run.font.fontWeight || 'normal');
        if (run.tracking) t.setAttribute('letter-spacing', run.tracking);
        t.setAttribute('fill', color); t.textContent = run.text;
        g.appendChild(t);
      }
      x += run.w;
    }
  }
  applyGlyphHalo(g, size, obj.haloRatio ?? HALO_RATIO);
  return g;
}

// Native text rotates around its anchor; formula rotates around its box center.
// These adapters keep the same native coordinate conventions for transforms.
export function nativeLabelCenter(obj) {
  const m = measureLabelTypography(obj);
  if (obj.type === 'formula') return { x: obj.x + m.w / 2, y: obj.y + m.h / 2 };
  const r = labelTypographyAngle(obj) * Math.PI / 180;
  return { x: obj.x + Math.cos(r) * m.w / 2 - Math.sin(r) * m.h / 2,
    y: obj.y + Math.sin(r) * m.w / 2 + Math.cos(r) * m.h / 2 };
}

export function positionNativeLabelAtCenter(obj, center) {
  const m = measureLabelTypography(obj);
  if (obj.type === 'formula') {
    obj.x = center.x - m.w / 2; obj.y = center.y - m.h / 2;
    obj.w = m.w; obj.h = m.h;
  } else {
    const r = labelTypographyAngle(obj) * Math.PI / 180;
    obj.x = center.x - Math.cos(r) * m.w / 2 + Math.sin(r) * m.h / 2;
    obj.y = center.y - Math.sin(r) * m.w / 2 - Math.cos(r) * m.h / 2;
  }
}

export function nativeLabelBounds(obj) {
  const m = measureLabelTypography(obj), center = nativeLabelCenter(obj);
  return { x: center.x - m.rotatedW / 2, y: center.y - m.rotatedH / 2, w: m.rotatedW, h: m.rotatedH };
}

export function nativeLabelPolygon(obj) {
  const m = measureLabelTypography(obj), center = nativeLabelCenter(obj);
  const r = labelTypographyAngle(obj) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-m.w / 2, -m.h / 2], [m.w / 2, -m.h / 2], [m.w / 2, m.h / 2], [-m.w / 2, m.h / 2]]
    .map(([x, y]) => ({ x: center.x + x * c - y * s, y: center.y + x * s + y * c }));
}

export function renderNativeLabelTypography(obj) {
  const wrapper = document.createElementNS(SVG_NS, 'g');
  if (obj.id) wrapper.dataset.id = obj.id;
  wrapper.appendChild(renderLabelTypography(obj, nativeLabelCenter(obj)));
  return wrapper;
}

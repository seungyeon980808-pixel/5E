// Old KICE papers (2007~2018) typeset chemical formulas, ions and units with symbol fonts
// whose glyphs sit on Mac keyboard positions. PDF.js decodes them as ordinary Mac Roman
// characters (CO™, Na±, 37˘C). Each table maps a font-name prefix to the printed character.
// Every entry was confirmed against rendered glyphs of the original PDFs; the evidence
// (question ids and crops) is kept with the glyph survey outside the site.
export const LEGACY_GLYPHS = {
  "GSMedium": {
    "¡": "₁",
    "™": "₂",
    "£": "₃",
    "¢": "₄",
    "∞": "₅",
    "§": "₆",
    "¶": "₇",
    "•": "₈",
    "ª": "₉",
    "º": "₀",
    "⁄": "¹",
    "¤": "²",
    "‹": "³",
    "›": "⁴",
    "ﬁ": "⁵",
    "ﬂ": "⁶",
    "‡": "⁷",
    "°": "⁸",
    "·": "⁹",
    "‚": "⁰",
    "±": "⁺",
    "—": "⁻",
    "≠": "⁺",
    "–": "⁻",
    "˘": "°",
    "`": "",
    "»": "",
    "˙": "ʰ",
    "å": "ₐ",
    "“": "ₑ",
    "≈": "ₓ",
    "μ": "ₘ",
    "«": "ₙ",
    "ß": "ₛ",
    "ç": "c",
    "©": "g",
    "ƒ": "f",
    "∫": "b",
    "∂": "d",
    "∑": "w",
    "Ω": "z",
    "Å": "A",
    "ı": "B",
    "Ç": "C",
    "": "K",
    "Ò": "L",
    "Ø": "O",
    "∏": "P",
    "Œ": "Q",
    "‰": "R",
    "„": "W",
    "˛": "X",
    "Á": "Y",
    "¸": "Z"
  },
  "GSMediIta": {
    "º": "₀",
    "¡": "₁",
    "™": "₂",
    "£": "₃",
    "¢": "₄",
    "∞": "₅",
    "§": "₆",
    "¤": "²",
    "±": "⁺",
    "—": "⁻",
    "˘": "°",
    "`": "",
    "‘": "ᵢ",
    "å": "ₐ",
    "≈": "ₓ",
    "μ": "ₘ",
    "«": "ₙ",
    "ß": "ₛ",
    "ƒ": "f",
    "∫": "b",
    "Ω": "z",
    "ı": "B",
    "´": "E",
    "*": "g",
    "^": "×"
  },
  "GSSymbol": {
    "a": "α",
    "b": "β",
    "c": "χ",
    "d": "δ",
    "e": "ε",
    "f": "φ",
    "g": "γ",
    "k": "κ",
    "l": "λ",
    "m": "μ",
    "p": "π",
    "q": "θ",
    "r": "ρ",
    "w": "ω",
    "y": "ψ",
    "D": "Δ",
    "F": "Φ",
    "W": "Ω",
    "÷": "√",
    "¥": "×",
    "•": "∞",
    "∞": "°",
    "◊": "·",
    "∫": "≡",
    "μ": "∝",
    "∏": "÷",
    "–": "∠",
    "º": "⋯",
    "å": "≒",
    "ƒ": "⊗",
    "\u0002": "",
    "\u0003": "",
    "\u000b": ""
  }
};

const prefixes = () => Object.keys(LEGACY_GLYPHS).sort((a, b) => b.length - a.length);

export function legacyTable(fontName = '') {
  const base = fontName.split('+').at(-1) || '';
  const prefix = prefixes().find((key) => base.startsWith(key));
  return prefix ? LEGACY_GLYPHS[prefix] : null;
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉₊₋ₘₛₐₑₓₙᵢ';
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ᵐˢᵃᵉˣⁿⁱ';
const toSuper = new Map([...SUBSCRIPT].map((char, index) => [char, [...SUPERSCRIPT][index]]));
const toSub = new Map([...SUPERSCRIPT].map((char, index) => [char, [...SUBSCRIPT][index]]));

/**
 * Converts one text item. The same glyph is sometimes raised to serve as a superscript
 * (2², ⁴₂He) or lowered as a subscript, so the script form follows the measured offset
 * from the neighbouring text baseline when it is known.
 */
export function legacyText(fontName, text, offset = null) {
  const table = legacyTable(fontName);
  if (!table) return text;
  return [...text].map((char) => {
    if (!Object.hasOwn(table, char)) return char;
    const value = table[char];
    if (offset === null || [...value].length !== 1) return value;
    if (offset > 0.3 && toSuper.has(value)) return toSuper.get(value);
    if (offset < -0.25 && toSub.has(value)) return toSub.get(value);
    return value;
  }).join('');
}

/** Subscript and superscript characters attach to the previous word without a space. */
export const attachedScript = /^[\u00b2\u00b3\u00b9\u2070-\u209f\u1d62\u1d63\u02b0-\u02e4\u1d43-\u1dbf°]/u;

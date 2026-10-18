import { verifyGlyph } from './ttf-glyphs.mjs';
import { hanyangPua, isOldHangulFont } from './hanyang-pua.mjs';

let registryPromise;

function registry() {
  if (!registryPromise) {
    registryPromise = fetch(new URL('./data/editable/glyph-proofs.json', import.meta.url))
      .then(async (response) => {
        if (!response.ok) throw new Error('수식 글꼴 검증표를 불러오지 못했습니다.');
        return response.json();
      }).catch((error) => { registryPromise = null; throw error; });
  }
  return registryPromise;
}

export function inQuestion(item, question, pageHeight) {
  if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) return false;
  const [x0, y0, x1, y1] = question.box;
  const x = item.transform[4];
  const y = pageHeight - item.transform[5];
  return x + item.width > x0 && x < x1 && y >= y0 - 3 && y <= y1 + 3;
}

export async function verifiedGlyphMap(question, pdf) {
  const needed = new Set();
  const mapped = new Map();
  for (const item of pdf.content.items) {
    if (!inQuestion(item, question, pdf.pageHeight)) continue;
    for (const char of item.str) {
      if (!/[\uE000-\uF8FF]/u.test(char)) continue;
      const codepoint = char.codePointAt(0);
      const key = `${item.fontName}:${codepoint}`;
      const text = isOldHangulFont(pdf.fonts[item.fontName]?.name) && hanyangPua(codepoint);
      if (text) mapped.set(key, text);
      else needed.add(key);
    }
  }
  if (!needed.size) return mapped;
  const { fonts } = await registry();
  const rendered = new Map();
  let renderingFont = '';
  for (let index = 0; index < (pdf.operations?.fnArray.length || 0); index += 1) {
    const op = pdf.operations.fnArray[index], args = pdf.operations.argsArray[index];
    if (op === pdf.OPS?.setFont) renderingFont = args[0];
    if (op !== pdf.OPS?.showText) continue;
    for (const glyph of args[0]) {
      if (!glyph?.unicode || !glyph.fontChar) continue;
      const key = `${renderingFont}:${glyph.unicode.codePointAt(0)}:${glyph.originalCharCode}`;
      if (!rendered.has(key)) rendered.set(key, new Set());
      rendered.get(key).add(glyph.fontChar.codePointAt(0));
    }
  }
  const checked = new Set();
  const rejected = new Set();
  for (const glyph of pdf.glyphs) {
    const key = `${glyph.fontId}:${glyph.codepoint}`;
    if (!needed.has(key)) continue;
    const font = pdf.fonts[glyph.fontId];
    const baseName = font?.name?.split('+').at(-1)?.split('-Identity-')[0];
    const candidates = fonts.filter((entry) => entry.fontName === baseName)
      .flatMap((entry) => entry.glyphs
        .filter((proof) => proof.codepoint === glyph.codepoint)
        .map((proof) => ({ ...proof, unitsPerEm: entry.unitsPerEm })));
    if (!font?.data || !candidates.length) { rejected.add(key); continue; }
    const identity = `${key}:${glyph.glyphId}`;
    if (checked.has(identity)) continue;
    checked.add(identity);
    let matched = false;
    for (const proof of candidates) {
      const renderings = rendered.get(identity);
      const verified = proof.cffSha256
        ? renderings?.size === 1 && await verifyGlyph(font.data, glyph.glyphId, proof, [...renderings][0])
        : await verifyGlyph(font.data, glyph.glyphId, proof);
      if (verified) {
        const previous = mapped.get(key);
        if (mapped.has(key) && previous !== proof.formula) throw new Error('같은 글자에 서로 다른 수식이 검증됐습니다.');
        mapped.set(key, proof.formula);
        matched = true;
      }
    }
    if (!matched) rejected.add(key);
  }
  const missing = [...needed].filter((key) => !mapped.has(key) || rejected.has(key));
  if (missing.length) {
    throw new Error(`원본 PDF에서 수식 글자 ${missing.length}종의 모양을 검증하지 못했습니다. 원본 PDF를 열어 확인해 주세요.`);
  }
  return mapped;
}

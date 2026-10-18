import { hanyangStart, hanyangSyllables } from './data/editable/hanyang-pua-data.mjs';

// KTUG's Public Domain mapping table, hypua2jamo commit cf030e6997529a49d67234e2f611f5b9a0af2b34.
// https://github.com/mete0r/hypua2jamo/blob/cf030e6997529a49d67234e2f611f5b9a0af2b34/data/hypua2jamocomposed.txt
export function hanyangPua(codepoint) {
  return hanyangSyllables[codepoint - hanyangStart] || undefined;
}

export function isOldHangulFont(fontName) {
  const family = fontName?.split('+').at(-1)?.replace(/-Identity-[HV]$/u, '').replace(/^\*/u, '');
  // PDF BaseFont strings may preserve EUC-KR bytes as Latin-1 characters.
  return ['옛한글', '¿¾ÇÑ±Û', '신명-중명조', '½Å¸í-Áß¸íÁ¶'].includes(family);
}

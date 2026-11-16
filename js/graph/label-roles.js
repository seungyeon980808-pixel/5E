// The declared axis unit is typography, not a guess based on parentheses.
// Keep the editable caption untouched; add explicit upright markup at render time.
export function graphLabelUnitSource(source, unit = '') {
  const text = source == null ? '' : String(source);
  const value = String(unit || '').trim();
  if (!value) return text;
  const escaped = [...value].filter(c => !/\s/.test(c)).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  return text.replace(new RegExp('([（(])\\s*' + escaped + '\\s*([)）])\\s*$'), (_, open, close) => `${open}\\mathrm{${value}}${close}`);
}

export function graphLabelRuns(line, parenthesesAreUnits = true) {
  const runs = [];
  let text = '', kind = null, depth = 0;
  const push = () => { if (text) runs.push({kind, text}); text = ''; };
  for (const ch of line) {
    let next;
    if (ch === '(') { depth++; next = 'unit'; }
    else if (ch === ')') next = 'unit';
    else if (/[가-힣ᄀ-ᇿ㄰-㆏]/.test(ch)) next = 'ko';
    else next = parenthesesAreUnits && depth > 0 ? 'unit' : 'math';
    if (kind !== next) { push(); kind = next; }
    text += ch;
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  push();
  return runs;
}

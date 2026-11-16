// Text-font fractions have a drawn rule, not an equation-font fraction glyph.
// A rule and two tightly stacked, centred rows are required; ordinary prose is untouched.
const right = item => item.x + item.width;
function rowScript(items) {
  let script = '', text = '', previous;
  const flush = () => { if (text) script += `\\text{${text.trim()}}`; text = ''; };
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    const gap = previous && item.x - right(previous) > Math.max(1.5, item.height * .2);
    if (item.math) { flush(); script += item.value.trim(); }
    else text += `${gap && text && !/\s$/u.test(text) && !/^\s/u.test(item.value) ? ' ' : ''}${item.value}`;
    previous = item;
  }
  flush();
  return script;
}

export function ruledTextFractions(items, primitives, pageHeight) {
  const used = new Set(), fractions = [];
  for (const rule of primitives.filter(p => p.type === 'line' && p.orient === 'h' && !p.dash && p.width <= 1)) {
    const [left, top, end] = rule.box, width = end - left;
    if (width < 15 || width > 500) continue;
    // Grid borders separate rows, not numerators and denominators.
    if (primitives.some(p => p.type === 'line' && p.orient === 'v'
      && (Math.abs(p.box[0] - left) < 1 || Math.abs(p.box[0] - end) < 1)
      && p.box[1] <= top + 1 && p.box[3] >= top - 1)) continue;
    const y = pageHeight - top;
    const nearby = items.filter(item => !used.has(item) && item.value.trim()
      && item.x >= left - 2 && right(item) <= end + 2 && item.height > 0
      && Math.abs(item.y - y) < item.height * 1.5);
    const upper = nearby.filter(item => item.y - y >= 1 && item.y - y <= item.height * .6);
    const lower = nearby.filter(item => y - item.y >= item.height * .65 && y - item.y <= item.height * 1.3);
    if (!upper.length || !lower.length || ![...upper, ...lower].some(item => /[가-힣]/u.test(item.value))) continue;
    const height = Math.max(...upper.map(item => item.height), ...lower.map(item => item.height));
    const baseline = row => Math.max(...row.filter(item => item.height >= height * .8).map(item => item.y));
    const u = baseline(upper), l = baseline(lower), separation = u - l;
    const centred = row => Math.abs((Math.min(...row.map(item => item.x)) + Math.max(...row.map(right))) / 2
      - (left + end) / 2) <= Math.max(2, width * .08);
    if (!Number.isFinite(separation) || separation < height * 1.05 || separation > height * 1.5
      || !centred(upper) || !centred(lower)
      || upper.some(item => Math.abs(item.y - u) > 2) || lower.some(item => Math.abs(item.y - l) > 2)
      || [...upper, ...lower].some(item => /[{}"\\]/u.test(item.math ? '' : item.value))) continue;
    const parts = [...upper, ...lower];
    parts.forEach(item => used.add(item));
    fractions.push({ ...upper[0], x: left, y: (u + l) / 2, width, height,
      raw: parts.map(item => item.raw).join(''), math: true, recovered: true,
      value: `\\frac{${rowScript(upper)}}{${rowScript(lower)}}` });
  }
  return [...items.filter(item => !used.has(item)), ...fractions];
}

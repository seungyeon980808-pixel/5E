/** Geometry is in PDF coordinates: y increases upward; width is measured ink/advance. */
const right = (item) => item.x + item.width;
const center = (item) => item.x + item.width / 2;
const ordered = (items) => [...items].sort((a, b) => a.x - b.x || b.y - a.y);
const structural = (item) => {
  if (!item.math || item.recovered) return '';
  if (item.raw === '\ue05c' || item.value?.trim() === '\\sqrt') return 'radical';
  if (item.raw === '\ue06d' || item.value?.trim() === '\\frac') return 'bar';
  if (item.raw === '\ue06e' || item.value?.trim() === '\\vec') return 'head';
  return '';
};
const fail = (item, reason) => {
  throw new Error(`수식 구조를 확인할 수 없습니다 (${reason}, ${item.x}, ${item.y}).`);
};
const join = (items) => ordered(items).reduce((text, item) => {
  const value = item.value.trim();
  return text + ((/\\[A-Za-z]+$/u.test(text) && /^[A-Za-z]/u.test(value))
    || (/\\ln$/u.test(text) && /^\d/u.test(value)) ? ' ' : '') + value;
}, '');
const rowBaseline = (items) => [...items].sort((a, b) => b.height - a.height || b.y - a.y)[0].y;
const covered = (item, bar) => item.recovered && item.value.startsWith('\\frac{')
  ? item.x >= bar.x - 0.7 && right(item) <= right(bar) + 0.7
  : center(item) >= bar.x - 0.7 && center(item) < right(bar) - 0.3;
const isLimit = (item) => /^\\(?:sum|int|prod|lim)(?:\s|$)/u.test(item.value.trim());

/** A tall radical can sit beside both its own top bar and an inner fraction bar.
 * The owner is the single highest bar that horizontally encloses every other match. */
export function radicalBarFor(radical, bars) {
  const matches = bars.filter((bar) => Math.abs(bar.x - right(radical)) <= 3
    && Math.abs(bar.y - radical.y) <= Math.max(6, radical.height));
  if (matches.length <= 1) return matches[0] || null;
  const [top, ...rest] = [...matches].sort((a, b) => b.y - a.y);
  return rest.every((bar) => top.y - bar.y > 2.3 && top.x <= bar.x + 0.7 && right(top) >= right(bar) - 0.7)
    ? top : undefined;
}

function combined(parts, anchor, value) {
  const x = Math.min(...parts.map((part) => part.x));
  return { ...anchor, x, width: Math.max(...parts.map(right)) - x,
    raw: parts.map((part) => part.raw || '').join(''), value, math: true, recovered: true };
}

function bindScripts(items, baseline) {
  const result = ordered(items);
  const consumed = new Set();
  const tallDelimiter = (item) => /^\\?[()[\]|{}]$/u.test(item.value.trim()) && item.height > 18
    && (item.value.trim() !== '\\{' || items.some((other) => other !== item
      && other.value.trim() === (item.value.trim() === '\\{' ? '\\}' : '\\{')
      && Math.abs(other.y - item.y) < 2.3 && Math.abs(other.height - item.height) < 2.3));
  const bases = result.filter((item) => item.math && (Math.abs(item.y - baseline) < 2.3
    || ((isLimit(item) || tallDelimiter(item))
      && Math.abs(item.y - baseline) <= item.height * 0.45)))
    .sort((a, b) => Number(isLimit(b)) - Number(isLimit(a)) || a.x - b.x);
  for (const base of bases) {
    const limit = isLimit(base);
    // Integral limits sit at the upper/lower right and may run several characters (x+a).
    const integral = limit && /^\\int(?:\s|$)/u.test(base.value.trim());
    const peers = bases.filter((item) => item !== base && item.x > base.x);
    const boundary = Math.min(...peers.map((item) => item.x
      - (limit && /^\\(?:sum|prod|lim)(?:\s|$)/u.test(item.value.trim()) ? 4 : 0)), Infinity);
    const candidates = result.filter((item) => item !== base && item.math && !consumed.has(item)
      && !structural(item) && Math.abs(item.y - baseline) >= 2.3
      && Math.abs(item.y - baseline) <= Math.max(12, base.height * 1.5)
      // A delimiter stretched around a fraction sits low but is never a script.
      && !tallDelimiter(item)
      && (!integral || item.x >= base.x)
      && item.x < boundary && (limit
        ? center(item) >= base.x - 4 && (item.x <= right(base) + 5 || integral)
        : item.x >= right(base) - (tallDelimiter(base) ? base.height * 0.06 : 1)
          && item.x - right(base) <= Math.max(8, base.height * 2.5)));
    for (const side of [-1, 1]) {
      const row = ordered(candidates.filter((item) => Math.sign(item.y - baseline) === side));
      if (!row.length) continue;
      const selected = [];
      let edge = right(base);
      for (const item of row) {
        if ((!limit || integral) && item.x - edge > (integral ? 3 : 5)) break;
        if (selected.length && Math.abs(item.y - selected[0].y) > Math.max(2, item.height * 0.35)
          && !(limit && selected.some((parent) => parent.height > item.height * 1.2
            && item.x - right(parent) >= -1 && item.x - right(parent) <= 3
            && Math.abs(item.y - parent.y) >= 2.3 && Math.abs(item.y - parent.y) <= parent.height))) break;
        selected.push(item);
        edge = Math.max(edge, right(item));
      }
      if (!selected.length) continue;
      const value = join(bindScripts(selected, rowBaseline(selected)));
      base.value = `${base.value.trimEnd()}${side < 0 ? '_' : '^'}{${value}}`;
      base.width = Math.max(right(base), ...selected.map(right)) - base.x;
      selected.forEach((item) => consumed.add(item));
    }
  }
  return result.filter((item) => !consumed.has(item));
}

function bindNuclearScripts(items, baseline) {
  const consumed = new Set();
  for (const lower of items) {
    if (!lower.math || !/^\d+$/u.test(lower.value.trim()) || baseline - lower.y < 2.3
      || baseline - lower.y > 8) continue;
    const uppers = items.filter((item) => item.math && /^\d+$/u.test(item.value.trim())
      && Math.abs(item.x - lower.x) < 1 && item.y - baseline > 2.3 && item.y - baseline < 8);
    const bases = items.filter((item) => item.math && /^[A-Za-z]/u.test(item.value.trim())
      && Math.abs(item.y - baseline) < 2.3 && item.x - right(lower) >= -0.5
      && item.x - right(lower) < 3);
    if (uppers.length !== 1 || bases.length !== 1) continue;
    const upper = uppers[0], base = bases[0];
    if (consumed.has(lower) || consumed.has(upper)) continue;
    base.value = `{}^{${upper.value.trim()}}_{${lower.value.trim()}}${base.value}`;
    const edge = right(base);
    base.x = Math.min(lower.x, upper.x);
    base.width = edge - base.x;
    consumed.add(lower); consumed.add(upper);
  }
  return items.filter((item) => !consumed.has(item));
}

/** Returns cloned items. Structural ambiguity throws; callers must surface it to users.
 * Split multi-glyph structural runs using actual glyph advances before calling this API.
 */
export function recoverEquationItems(items, baseline, fractionHeightScale = 2) {
  let work = items.map((item) => {
    const limit = item.value.trim() === 'lim' && (item.math || items.some((part) => part.math
      && /→/u.test(part.value) && part.y < item.y - 2.3 && part.y > item.y - item.height
      && center(part) >= item.x - 3 && center(part) <= right(item) + 3));
    return { ...item, math: item.math || limit, value: limit ? '\\lim' : item.value };
  });
  const letters = ordered(work.filter((item) => item.math && Math.abs(item.y - baseline) < 2.3));
  for (let index = 0; index < letters.length - 2; index++) {
    const parts = letters.slice(index, index + 3);
    if (parts.map((item) => item.value).join('') !== 'lim'
      || parts.some((item) => Math.abs(item.y - parts[0].y) > 0.8)
      || parts.slice(1).some((item, offset) => item.x - right(parts[offset]) > 2)
      || !work.some((item) => item.math && item.y < parts[0].y - 2.3
        && item.y > parts[0].y - parts[0].height
        && center(item) >= parts[0].x - 3 && center(item) <= right(parts[2]) + 3)) continue;
    work = [...work.filter((item) => !parts.includes(item)), combined(parts, parts[0], '\\lim')];
  }
  for (const item of work) {
    if (item.math && !item.recovered && /[\ue05c\ue06d\ue06e]/u.test(item.raw || '') && !structural(item)) {
      fail(item, 'measured glyph boundaries required');
    }
  }
  const radicals = work.filter((item) => structural(item) === 'radical');
  const bars = work.filter((item) => structural(item) === 'bar');
  const ownership = new Map();
  for (const radical of radicals) {
    const match = radicalBarFor(radical, bars);
    if (!match || ownership.has(match)) fail(radical, 'ambiguous radical bar');
    ownership.set(match, radical);
  }
  for (const bar of [...bars].sort((a, b) => a.width - b.width)) {
    const radical = ownership.get(bar);
    const heads = work.filter((item) => structural(item) === 'head'
      && Math.abs(item.x - right(bar)) <= 3 && Math.abs(item.y - bar.y) <= 3);
    if (heads.length > 1 || (radical && heads.length)) fail(bar, 'ambiguous accent');
    const enclosing = bars.filter((other) => other !== bar && other.width > bar.width
      && other.x <= bar.x && right(other) >= right(bar));
    const nearby = work.filter((item) => item !== bar && item !== radical && !heads.includes(item)
      && item.math && covered(item, bar) && Math.abs(item.y - bar.y) <= Math.max(18, bar.height * (radical ? 2 : fractionHeightScale))
      && enclosing.every((outer) => (item.y - outer.y) * (bar.y - outer.y) > 0));
    if (nearby.some((item) => structural(item))) fail(bar, 'overlapping structures');
    const above = nearby.filter((item) => item.y > bar.y + 2.3);
    const below = nearby.filter((item) => item.y < bar.y - 2.3);
    // A segment overline (PR̅) sits right on its letters: the bar baseline is only ~0.3 em above
    // theirs, while a fraction bar sits ~0.3 em above the numerator's baseline and ~0.8 em above
    // the denominator's. A glyph over it that belongs to the previous text line (over 1.3 em
    // higher) must not turn the overline into a fraction.
    const hugged = below.filter((item) => bar.y - item.y <= item.height * 0.4);
    const previousLine = above.filter((item) => item.y - bar.y >= item.height * 1.3);
    // Only letters (segment names) take an overline; a numerator's digits or operators never do.
    if (!radical && !heads.length && hugged.length && hugged.length === below.length
      && hugged.every((item) => /^[A-Za-z](?:_\{[A-Za-z0-9]+\})?$/u.test(item.value.trim()))
      && above.length && previousLine.length === above.length) above.length = 0;
    if (!radical && !above.length) {
      // Segment names such as S₁S₂ often use the text font under an equation-font overbar.
      for (const item of work) {
        if (item.math || !/^(?:[A-Za-z][′']?){1,4}$/u.test(item.value.replace(/\s/gu, '')) || !covered(item, bar)
          || item.y >= bar.y - 2.3 || bar.y - item.y > Math.max(8, bar.height)) continue;
        const letter = { ...item, value: item.value.replace(/\s/gu, ''), math: true };
        work = work.map((entry) => entry === item ? letter : entry);
        below.push(letter);
        nearby.push(letter);
      }
    }
    const onAxis = nearby.filter((item) => Math.abs(item.y - bar.y) <= 2.3);
    if (!radical && above.length && below.length) {
      const assigned = new Map();
      for (const script of ordered(onAxis)) {
        let parents = [...above, ...below].filter((candidate) => candidate.height > script.height * 1.2
          && script.x - right(candidate) >= -1 && script.x - right(candidate) <= Math.max(3, candidate.height * 0.4)
          && Math.abs(script.y - candidate.y) >= 2.3 && Math.abs(script.y - candidate.y) <= 10);
        if (parents.length > 1) {
          // The nearest base wins; a far fallback only applies when nothing is adjacent.
          const gap = (candidate) => Math.abs(script.x - right(candidate));
          const nearest = Math.min(...parents.map(gap));
          if (nearest <= 3) parents = parents.filter((candidate) => gap(candidate) - nearest < 0.5);
        }
        let row = parents.length === 1 ? (above.includes(parents[0]) ? above : below) : null;
        if (!parents.length) {
          const neighbors = [...assigned.keys()].filter((part) => Math.abs(part.y - script.y) < 0.8
            && Math.abs(part.height - script.height) < 0.8
            && script.x - right(part) >= -0.5 && script.x - right(part) <= 3);
          if (neighbors.length === 1) row = assigned.get(neighbors[0]);
        }
        if (!row) fail(script, 'fraction script baseline collision');
        row.push(script);
        assigned.set(script, row);
      }
    }
    let parts, anchor, value;
    if (radical) {
      const radicand = nearby.filter((item) => item.y <= bar.y + 2.3
        && right(item) <= right(bar) + 1);
      if (!radicand.length || above.length) fail(bar, 'radical extent');
      parts = [radical, bar, ...radicand];
      anchor = { ...radical, y: rowBaseline(radicand), height: Math.max(...radicand.map((item) => item.height)) };
      // A root index is a small digit above the hook, left of the top bar.
      // It belongs to the radical rather than a trailing baseline factor.
      const indices = work.filter((item) => item !== radical && item !== bar && !radicand.includes(item)
        && item.math && /^\d+$/u.test(item.value.trim()) && item.height <= anchor.height * .7
        && item.x >= radical.x - .5 && right(item) <= bar.x + .5
        && item.y > anchor.y + anchor.height * .25
        && item.y < bar.y + radical.height);
      if (indices.length && Math.max(...indices.map((item) => item.y)) - Math.min(...indices.map((item) => item.y)) > .8)
        fail(radical, 'ambiguous radical index');
      parts.push(...indices);
      const index = indices.length ? `[${join(indices)}]` : '';
      value = `\\sqrt${index}{${join(bindScripts(radicand, anchor.y))}}`;
    } else if (above.length && below.length && !heads.length) {
      if (nearby.length !== above.length + below.length) fail(bar, 'fraction baseline collision');
      parts = [bar, ...above, ...below];
      anchor = { ...bar, height: Math.max(...[...above, ...below].map((item) => item.height)) };
      // HWP bar baselines sit below the expression's mathematical axis.
      anchor.y = Math.abs(bar.y - baseline) <= anchor.height * 0.55
        ? baseline : bar.y + anchor.height * 0.35;
      value = `\\frac{${join(bindScripts(above, rowBaseline(above)))}}{${join(bindScripts(below, rowBaseline(below)))}}`;
    } else if (!above.length && below.length) {
      const text = join(bindScripts(below, rowBaseline(below)));
      if (!/^(?:[A-Za-z](?:_\{[A-Za-z0-9]+\})?[′']?){1,4}$/u.test(text)
        && !(heads.length === 1 && text === '0')) fail(bar, 'ambiguous overbar');
      parts = [bar, ...heads, ...below];
      anchor = { ...below[0], y: rowBaseline(below) };
      value = `\\${heads.length ? 'vec' : 'bar'}{${text}}`;
    } else fail(bar, 'missing numerator or denominator');
    const removed = new Set(parts);
    work = [...work.filter((item) => !removed.has(item)), combined(parts, anchor, value)];
  }
  const unresolved = work.find((item) => structural(item));
  if (unresolved) fail(unresolved, 'unbound structural glyph');
  return bindScripts(bindNuclearScripts(work, baseline), baseline);
}

const braceKind = (item) => ({ '\ue078': 'top', '\ue079': 'middle', '\ue07a': 'bottom', '\ue07b': 'extender',
  '\\braceTop': 'top', '\\braceMiddle': 'middle', '\\braceBottom': 'bottom', '\\braceExtender': 'extender' })[item.raw] ||
  ({ '\\braceTop': 'top', '\\braceMiddle': 'middle', '\\braceBottom': 'bottom', '\\braceExtender': 'extender' })[item.value];

// Tall square brackets are drawn from corner pieces joined by vertical extenders.
const bracketPiece = (item) => ({ '\\bracketTopLeft': ['left', 'top'], '\\bracketBottomLeft': ['left', 'bottom'],
  '\\bracketTopRight': ['right', 'top'], '\\bracketBottomRight': ['right', 'bottom'],
  '\\bracketRightExtender': ['right', 'extender'] })[item.value?.trim()];

/** Joins stretchy bracket pieces into one LEFT [ ... RIGHT ] equation spanning the enclosed items. */
export function recoverStretchyBrackets(items) {
  let work = items.map((item) => ({ ...item }));
  const tops = work.filter((item) => bracketPiece(item)?.join() === 'left,top').sort((a, b) => a.x - b.x);
  for (const top of tops) {
    if (!work.includes(top)) continue;
    const leftColumn = work.filter((item) => Math.abs(item.x - top.x) < 0.8 && item.y <= top.y + 0.5
      && (bracketPiece(item)?.[0] === 'left' || (item.math && item.value.trim() === '|')));
    const bottom = leftColumn.filter((item) => bracketPiece(item)?.join() === 'left,bottom').sort((a, b) => b.y - a.y)[0];
    if (!bottom) fail(top, 'incomplete square bracket');
    const rightTop = work.filter((item) => bracketPiece(item)?.join() === 'right,top' && item.x > top.x
      && Math.abs(item.y - top.y) < 0.8).sort((a, b) => a.x - b.x)[0];
    if (!rightTop) fail(top, 'unmatched square bracket');
    const rightColumn = work.filter((item) => Math.abs(item.x - rightTop.x) < 0.8 && bracketPiece(item)?.[0] === 'right');
    const rightBottom = rightColumn.find((item) => bracketPiece(item)?.join() === 'right,bottom' && Math.abs(item.y - bottom.y) < 0.8);
    if (!rightBottom) fail(rightTop, 'incomplete square bracket');
    const low = bottom.y - bottom.height * 0.4;
    const high = top.y + top.height * 0.4;
    const pieces = new Set([...leftColumn.filter((item) => item.y >= bottom.y - 0.5), ...rightColumn]);
    const inner = work.filter((item) => !pieces.has(item) && item.x > top.x + 0.5 && item.x < rightTop.x - 0.5
      && item.y >= low && item.y <= high);
    if (!inner.length || inner.some((item) => !item.math)) fail(top, 'square bracket contents');
    if (inner.some((item) => bracketPiece(item))) fail(top, 'nested square brackets');
    const heights = inner.map((item) => item.height).sort((a, b) => a - b);
    const middle = (top.y + bottom.y) / 2;
    const baseline = [...inner].sort((a, b) => Math.abs(a.y - middle) - Math.abs(b.y - middle))[0].y;
    const body = join(recoverEquationItems(inner, baseline));
    const removed = new Set([...pieces, ...inner]);
    work = [...work.filter((item) => !removed.has(item)), combined([...pieces, ...inner],
      { ...top, y: baseline, height: heights[Math.floor(heights.length / 2)] }, `LEFT [ ${body} RIGHT ]`)];
  }
  const orphan = work.find((item) => bracketPiece(item) && !item.recovered);
  if (orphan) fail(orphan, 'orphan square bracket');
  return work;
}

/** Bind multiline left-brace fragments before normal line assignment. */
export function recoverPiecewiseItems(items) {
  let work = items.map((item) => ({ ...item }));
  for (const top of work.filter((item) => braceKind(item) === 'top').sort((a, b) => b.y - a.y)) {
    const column = work.filter((item) => braceKind(item) && Math.abs(item.x - top.x) < 0.8 && item.y <= top.y);
    const bottom = column.filter((item) => braceKind(item) === 'bottom').sort((a, b) => b.y - a.y)[0];
    if (!bottom) fail(top, 'incomplete piecewise brace');
    const fragments = column.filter((item) => item.y >= bottom.y);
    const middle = fragments.filter((item) => braceKind(item) === 'middle');
    if (middle.length !== 1 || fragments.filter((item) => braceKind(item) === 'top').length !== 1) {
      fail(top, 'ambiguous piecewise brace');
    }
    for (const [upper, lower] of [[top, middle[0]], [middle[0], bottom]]) {
      if (upper.y - lower.y > top.height * 1.15 && !fragments.some((item) =>
        braceKind(item) === 'extender' && item.y < upper.y && item.y > lower.y)) fail(top, 'incomplete brace connector');
    }
    const candidates = work.filter((item) => !braceKind(item) && item.value.trim()
      && !(!item.math && /^[,.;]$/u.test(item.value.trim()) && Math.abs(item.y - middle[0].y) < 2.3)
      && item.x >= right(top) - 0.8 && item.y <= top.y + top.height * 0.7
      && item.y >= bottom.y - bottom.height * 0.7);
    if (!candidates.length) fail(top, 'empty piecewise expression');
    // The brace center is between rows; each row supplies its own script baseline below.
    const composed = recoverEquationItems(candidates, NaN, 1.5);
    const heights = composed.filter((item) => item.height > 0).map((item) => item.height).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)];
    const rows = [];
    for (const item of [...composed].filter((item) => item.height >= height * 0.85
      && item.height <= height * 1.6 && !isLimit(item)).sort((a, b) => b.y - a.y)) {
      const row = rows.find((entry) => Math.abs(entry.y - item.y) < height * 0.3);
      if (!row) rows.push({ y: item.y, items: [] });
    }
    if (rows.length < 2 || rows.length > 8) fail(top, 'piecewise row count');
    for (const item of composed) {
      const row = [...rows].sort((a, b) => Math.abs(a.y - item.y) - Math.abs(b.y - item.y))[0];
      const limit = composed.find((part) => isLimit(part) && Math.abs(part.y - row.y) < part.height * 0.45
        && center(item) >= part.x - 4 && item.x <= right(part) + 8);
      if (Math.abs(row.y - item.y) > Math.max(8, height * 0.8, limit ? limit.height * 0.65 : 0)) {
        fail(item, 'ambiguous piecewise row');
      }
      row.items.push(item);
    }
    const splitCandidates = rows.map((row) => {
      row.items = ordered(row.items);
      return row.items.filter((item, index) => index > 0
        && item.x - right(row.items[index - 1]) > height * 0.5);
    });
    const splits = splitCandidates[0].filter((item) => splitCandidates.every((parts) =>
      parts.some((part) => Math.abs(part.x - item.x) < 2.3)));
    if (splits.length !== 1) fail(top, 'ambiguous piecewise condition column');
    const splitX = splits[0].x;
    const values = rows.map((row) => {
      const rowSplit = splitCandidates[rows.indexOf(row)].find((part) => Math.abs(part.x - splitX) < 2.3).x;
      if (row.items.some((item, index) => index > 0 && Math.abs(item.x - rowSplit) >= 2.3
        && item.x - right(row.items[index - 1]) > height * 4.5)) fail(top, 'disconnected piecewise row');
      const expression = row.items.filter((item) => item.x < rowSplit);
      const condition = row.items.filter((item) => item.x >= rowSplit);
      if (!expression.length || !condition.length) fail(top, 'incomplete piecewise row');
      const render = (parts) => {
        const anchors = parts.filter((item) => item.height >= height * 0.85
          && item.height <= height * 1.6 && !isLimit(item)
          && !/^[()[\]|]$/u.test(item.value.trim())).map((item) => item.y).sort((a, b) => a - b);
        const formula = parts.map((item) => ({ ...item, math: item.math || /^(?:sin|cos|tan|ln|log|lim)$/u.test(item.value.trim()) }));
        return join(recoverEquationItems(formula, anchors[Math.floor(anchors.length / 2)] ?? row.y).map((item) => ({ ...item,
          value: !item.math && /[가-힣]/u.test(item.value) ? `\\text{${item.value}}` : item.value })));
      };
      return `${render(expression)} & ${render(condition)}`;
    });
    const removed = new Set([...fragments, ...candidates]);
    work = [...work.filter((item) => !removed.has(item)), combined([...fragments, ...candidates],
      { ...middle[0], y: middle[0].y, height }, `cases{${values.join(' # ')}}`)];
  }
  const orphan = work.find((item) => braceKind(item) && !item.recovered);
  if (orphan) fail(orphan, 'orphan piecewise brace');
  return work;
}

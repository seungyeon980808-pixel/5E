import { readQuestionPdf } from './pdf-viewer.mjs?v=library-release-20261011-3';
import { questionFigures } from './figure-fallback.mjs?v=library-release-20261011-3';
import { observedContentRegions } from './content-integrity.mjs?v=readability-20261004-4';
import { appendLineRuns } from './prose-flow.mjs?v=readability-20261004-4';
import { ruledTextFractions } from './ruled-text-fractions.mjs?v=subject-review-20261011-1';
import { inQuestion, verifiedGlyphMap } from './live-fonts.mjs';
import { radicalBarFor, recoverEquationItems, recoverPiecewiseItems, recoverStretchyBrackets } from './live-equations.mjs?v=typography-20261003-3';
import { attachedScript, legacyTable, legacyText } from './legacy-glyphs.mjs';
import { drawingPrimitives, figureRegions, insideFigure } from './pdf-drawings.mjs?v=readability-20261004-4';
import { recoverQuestionRegion } from './question-region.mjs';
// --- data-table hook
import { extractTables, tableFlow, restoreTableBlocks } from './live-tables.mjs?v=readability-20261004-4';

function textFor(item, glyphs) {
  const decoded = [...item.str].map((char) => {
    if (!/[\uE000-\uF8FF]/u.test(char)) return char;
    const formula = glyphs.get(`${item.fontName}:${char.codePointAt(0)}`);
    if (formula === undefined) throw new Error('검증되지 않은 수식 글자가 남았습니다.');
    return formula;
  });
  return decoded.reduce((result, value) => {
    const separator = /\\[A-Za-z]+$/u.test(result) && /^[A-Za-z]/u.test(value) ? ' ' : '';
    return result + separator + value;
  }, '');
}

/** KICE often sets subscripts such as U_A in the text font beside an equation-font base. */
export function attachTextScripts(items, recoverBases = true) {
  const bases = items.filter((item) => item.math && /^[A-Za-z\\]/u.test(item.value.trim()));
  const textScripts = items.map((item) => {
    if (item.math || !/^[A-Za-z0-9]{1,3}$/u.test(item.value.trim())) return item;
    const base = bases.find((candidate) => item.height > 0 && item.height <= candidate.height * 0.8
      && item.x - (candidate.x + candidate.width) >= -1 && item.x - (candidate.x + candidate.width) <= 1.5
      && Math.abs(item.y - candidate.y) >= 2.3 && Math.abs(item.y - candidate.y) <= candidate.height * 0.7);
    return base ? { ...item, value: item.value.trim(), math: true } : item;
  });
  if (!recoverBases) return textScripts;
  const consumed = new Set();
  const promoted = new Map();
  // Chemical formulas such as NaHCO or KMnO are longer than a variable name.
  for (const base of items.filter((item) => !item.math && /^(?:[A-Za-z]{1,4}|(?:[A-Z][a-z]?){1,6})$/u.test(item.value.trim()))) {
    const first = items.filter((item) => item.math && /^[A-Za-z0-9+−-]{1,3}$/u.test(item.value.trim())
      && item.height > 0 && item.height <= base.height * 0.82
      && item.x - (base.x + base.width) >= -1 && item.x - (base.x + base.width) <= Math.max(1.5, base.height * 0.22)
      && Math.abs(item.y - base.y) >= Math.max(1.8, base.height * 0.2)
      && Math.abs(item.y - base.y) <= base.height * 0.7);
    // A charge or index runs on at the same small size and height (A²⁺, C₆₀, PM₂.₅, CO₃²⁻):
    // keep every touching glyph of that run in one script.
    const scripts = first.map((start) => {
      const run = [start];
      for (;;) {
        const last = run.at(-1);
        const next = items.find((item) => item.math && !run.includes(item) && !first.includes(item)
          && /^[A-Za-z0-9+−.-]$/u.test(item.value.trim())
          && Math.abs(item.y - start.y) < 1 && Math.abs(item.height - start.height) < 0.5
          && item.x - (last.x + last.width) >= -1 && item.x - (last.x + last.width) <= 1.6);
        if (!next) break;
        run.push(next);
      }
      return run;
    });
    // A charge printed after the subscript (CO₃²⁻) starts where that subscript ends.
    for (const sub of scripts.filter((run) => run[0].y < base.y)) {
      if (scripts.some((run) => run[0].y > base.y)) break;
      const end = sub.at(-1);
      const start = items.find((item) => item.math && !scripts.flat().includes(item)
        && /^[0-9+−-]$/u.test(item.value.trim()) && item.y - base.y >= Math.max(1.8, base.height * 0.2)
        && item.y - base.y <= base.height * 0.7 && Math.abs(item.height - end.height) < 0.5
        && item.x - (end.x + end.width) >= -2 && item.x - (end.x + end.width) <= 1.6);
      if (!start) continue;
      const run = [start];
      for (;;) {
        const last = run.at(-1);
        const next = items.find((item) => item.math && !run.includes(item) && /^[0-9+−-]$/u.test(item.value.trim())
          && Math.abs(item.y - start.y) < 1 && Math.abs(item.height - start.height) < 0.5
          && item.x - (last.x + last.width) >= -1 && item.x - (last.x + last.width) <= 1.6);
        if (!next) break;
        run.push(next);
      }
      scripts.push(run);
    }
    const bracket = items.some((item) => item.math && item.value.trim() === '('
      && Math.abs(item.y - base.y) < 1.5 && item.x - base.x - base.width >= -1
      && item.x - base.x - base.width <= 1.5);
    if (!scripts.length && !bracket) continue;
    const upright = /HaansoftBatang/u.test(base.font || '') && !/It|Italic/iu.test(base.font || '');
    const value = upright ? `{rm ${base.value.trim()}}` : base.value.trim();
    const text = (run) => run.map((item) => item.value.trim()).join('');
    promoted.set(base, { ...base, math: true, recovered: true,
      width: Math.max(base.x + base.width, ...scripts.flat().map((item) => item.x + item.width)) - base.x,
      value: value + scripts.sort((a, b) => b[0].y - a[0].y).map((run) => `${run[0].y < base.y ? '_' : '^'}{${text(run)}}`).join('') });
    scripts.flat().forEach((item) => consumed.add(item));
  }
  // Left indices of permutations/combinations are lowered just like the right index.
  for (const [base, replacement] of promoted) {
    const before = items.find((item) => item.math && !consumed.has(item) && /^[A-Za-z0-9]{1,3}$/u.test(item.value.trim())
      && item.height > 0 && item.height <= base.height * 0.82
      && base.x - item.x - item.width >= -1 && base.x - item.x - item.width <= 1.5
      && Math.abs(item.y - base.y) >= Math.max(1.8, base.height * 0.2)
      && Math.abs(item.y - base.y) <= base.height * 0.7);
    if (!before) continue;
    promoted.set(base, { ...replacement, x: before.x, width: replacement.x + replacement.width - before.x,
      value: `{}${before.y < base.y ? '_' : '^'}{${before.value.trim()}}${replacement.value}` });
    consumed.add(before);
  }
  // Continue a formula across text-font element tails and parentheses without crossing a word gap.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items.filter((entry) => !entry.math && !promoted.has(entry)
      && /^(?:(?:[A-Z][a-z]?){1,4}|\(|\)\s*[＋+]?)$/u.test(entry.value.trim()))) {
      const neighbour = [...items.filter((entry) => entry.math && !consumed.has(entry)), ...promoted.values()]
        .some((other) => Math.abs(item.y - other.y) < 1.5
          && Math.max(item.x - other.x - other.width, other.x - item.x - item.width) >= -1
          && Math.max(item.x - other.x - other.width, other.x - item.x - item.width) <= 1.5);
      if (!neighbour) continue;
      const upright = /HaansoftBatang/u.test(item.font || '') && !/It|Italic/iu.test(item.font || '')
        && /^[A-Za-z]+$/u.test(item.value.trim());
      promoted.set(item, { ...item, math: true, value: upright ? `{rm ${item.value.trim()}}` : item.value.trim().replace(/\s+/gu, '~') });
      changed = true;
    }
  }
  // A state/variable printed in the text font between equation parentheses belongs to them.
  for (const item of items.filter((entry) => !entry.math && /^[A-Za-z]{1,3}$/u.test(entry.value.trim()))) {
    const left = items.find((other) => (other.math || promoted.has(other)) && other.value.trim() === '('
      && Math.abs(other.y - item.y) < 1.5 && item.x - other.x - other.width >= -1
      && item.x - other.x - other.width <= 1.5);
    const right = items.find((other) => /^\)\s*[＋+]?$/u.test(other.value.trim())
      && Math.abs(other.y - item.y) < 1.5 && other.x - item.x - item.width >= -1
      && other.x - item.x - item.width <= 1.5);
    if (left && right) {
      // 5E 기출 복원: 본문 글꼴(바탕 바로 선 글자)이면 {rm …}으로 표시해 둔다(한글 수식에서도 바로 선 글자, 엔진이 본문 글로 되돌릴 수 있게).
      const upright = /Batang/u.test(item.font || '') && !/It|Italic/iu.test(item.font || '');
      promoted.set(item, { ...item, value: upright ? `{rm ${item.value.trim()}}` : item.value.trim(), math: true });
      promoted.set(right, { ...right, value: right.value.trim().replace(/\s+/gu, '~'), math: true });
    }
  }
  return items.flatMap((item, index) => consumed.has(item) ? [] : [promoted.get(item) || textScripts[index]]);
}

/** Ordinary-font ion charges are positioned above their chemical base in modern PDFs. */
export function attachTextCharges(items) {
  const superscript = { '+': '⁺', '＋': '⁺', '-': '⁻', '−': '⁻', '－': '⁻',
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return items.map((item) => {
    if (item.math || !/^[0-9]{0,2}[+＋−－-]$/u.test(item.value.trim())) return item;
    const base = items.filter((other) => other !== item && !other.math
      && /(?:[A-Z][a-z]?[0-9₀-₉]*)+$/u.test(other.value.trim())
      && item.height > 0 && item.height <= other.height * 0.8
      && item.y - other.y >= other.height * 0.2 && item.y - other.y <= other.height * 0.7
      && item.x - other.x - other.width >= -0.8 && item.x - other.x - other.width <= 1.5)
      .sort((a, b) => Math.abs(item.x - a.x - a.width) - Math.abs(item.x - b.x - b.width))[0];
    return base ? { ...item, y: base.y, value: [...item.value.trim()].map((char) => superscript[char]).join('') } : item;
  });
}

function clipItems(question, pdf, glyphs) {
  const advances = new Map(pdf.glyphs?.map((glyph) =>
    [`${glyph.fontId}:${glyph.codepoint}`, glyph.advance]) || []);
  const source = pdf.equationItems ? [...pdf.content.items.filter((item) =>
    !/^(?:HyhwpEQ|HYhwpEQ)/u.test(pdf.fonts[item.fontName]?.name?.split('+').at(-1) || '')),
  ...pdf.equationItems] : pdf.content.items;
  const fontOf = (item) => pdf.fonts[item.fontName]?.name;
  // Labels drawn inside figures (axes, points, captions of drawings) are not question text.
  let regions = [];
  let primitives = [];
  if (pdf.operations && pdf.OPS) {
    try {
      primitives = drawingPrimitives(pdf.operations, pdf.OPS, pdf.pageHeight);
      regions = figureRegions(primitives, pdf.content.items, pdf.pageHeight);
    } catch { regions = []; }
  }
  const inQuestionItems = source.filter((item) => inQuestion(item, question, pdf.pageHeight));
  const dropped = new Set(regions.length ? inQuestionItems.filter((item) => insideFigure(item, regions, pdf.pageHeight)) : []);
  // Punctuation and script glyphs left inside a figure whose other labels were dropped
  // (a lone "(", "₁⁺") belong to those labels, never to running text.
  if (dropped.size) {
    const box = (item) => [item.transform[4], pdf.pageHeight - item.transform[5] - (item.height || 0),
      item.transform[4] + item.width, pdf.pageHeight - item.transform[5]];
    const labelled = regions.filter((region) => [...dropped].some((item) => {
      const b = box(item);
      return b[0] >= region.box[0] - 2 && b[2] <= region.box[2] + 2 && b[1] >= region.box[1] - 2 && b[3] <= region.box[3] + 2;
    }));
    for (const item of inQuestionItems) {
      if (dropped.has(item) || /[\p{L}\p{N}]/u.test(legacyText(fontOf(item), item.str || '').replace(/[\u00b2\u00b3\u00b9\u2070-\u209f]/gu, ''))) continue;
      const b = box(item);
      if (labelled.some((region) => b[0] >= region.box[0] - 1 && b[2] <= region.box[2] + 1 && b[1] >= region.box[1] - 1 && b[3] <= region.box[3] + 1)) dropped.add(item);
    }
  }
  const clipped = inQuestionItems.filter((item) => !dropped.has(item));
  // Lets buildLiveStructure know figure labels were removed from this question.
  clipItems.lastDropped = dropped.size;
  clipItems.lastRegions = regions;
  clipItems.lastPrimitives = primitives;
  // Legacy symbol glyphs double as subscripts and superscripts: the same glyph printed on the
  // baseline is a subscript and raised it is a superscript. Measure each script-only item
  // against the nearest item holding ordinary letters or digits.
  const ordinary = (item) => {
    const table = legacyTable(fontOf(item));
    return [...(item.str || '')].some((char) => /[\p{L}\p{N}]/u.test(char) && !(table && Object.hasOwn(table, char)));
  };
  const scriptBase = (item) => {
    if (!legacyTable(fontOf(item)) || ordinary(item)) return null;
    const [x0, x1] = [item.transform[4], item.transform[4] + item.width];
    const gap = (other) => Math.max(0, other.transform[4] - x1, x0 - (other.transform[4] + other.width));
    return clipped.filter((other) => other !== item && other.height > 0 && ordinary(other) && gap(other) <= 3
      && Math.abs(other.transform[5] - item.transform[5]) < Math.max(other.height, item.height || 0) * 0.9)
      .sort((a, b) => gap(a) - gap(b) || b.height - a.height
        || Math.abs(a.transform[5] - item.transform[5]) - Math.abs(b.transform[5] - item.transform[5]))[0] || null;
  };
  return attachTextScripts(attachTextCharges(clipped
    .flatMap((item) => {
      const scriptOf = scriptBase(item);
      const offset = scriptOf ? (item.transform[5] - scriptOf.transform[5]) / scriptOf.height : null;
      const base = { x: item.transform[4], y: item.transform[5], width: item.width,
      height: item.height || 0, font: fontOf(item),
      raw: item.str, value: legacyText(fontOf(item), textFor(item, glyphs), offset),
      math: /^(?:HyhwpEQ|HYhwpEQ)/u.test(pdf.fonts[item.fontName]?.name?.split('+').at(-1) || '') };
      // A raised or lowered script belongs to its base's line.
      if (scriptOf && attachedScript.test(base.value.trim())) base.y = scriptOf.transform[5];
      if (!base.math || !/[\uE05C\uE06D\uE06E]/u.test(item.str) || [...item.str.trim()].length < 2) return [base];
      const chars = [...item.str];
      const widths = chars.map((char) => advances.get(`${item.fontName}:${char.codePointAt(0)}`)
        ?? (/\s/u.test(char) ? 0 : undefined));
      if (widths.some((width) => !Number.isFinite(width))) {
        throw new Error('수식 구조 글자의 실제 너비를 확인할 수 없습니다.');
      }
      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total <= 0) throw new Error('수식 구조 글자의 실제 너비가 없습니다.');
      let x = base.x;
      return chars.map((char, index) => {
        const width = base.width * widths[index] / total;
        const part = { ...base, x, width, raw: char, value: textFor({ str: char, fontName: item.fontName }, glyphs) };
        x += width;
        return part;
      });
    })), false);
}

function findLines(items) {
  items = items.map((item) => !item.math && /^(?:[′']|ln)$/u.test(item.value.trim())
    && (items.some((bar) => bar.math && bar.raw === '\uE06D'
      && item.x >= bar.x && item.x + item.width <= bar.x + bar.width
      && Math.abs(item.y - bar.y) < 18)
      || (/^[′']$/u.test(item.value.trim()) && items.some((next) => next.math
        && next.value.trim() === '(' && next.height > 18
        && next.x - item.x - item.width >= -1 && next.x - item.x - item.width < 1
        && Math.abs(next.y + next.height * 0.17 - item.y) < 1.5)))
    && items.some((base) => base.math && Math.abs(base.y - item.y) < 1
      && ((item.x - base.x - base.width >= -1 && item.x - base.x - base.width < 3)
        || (item.value.trim() === 'ln' && base.x - item.x - item.width >= -1
          && base.x - item.x - item.width < 3)))
    ? { ...item, math: true, value: item.value.trim() === 'ln' ? '\\ln' : item.value } : item);
  const lines = [];
  for (const item of items.filter((value) => !value.math && value.raw.trim())
    .sort((left, right) => right.y - left.y)) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) < 2.5);
    if (line) line.anchors.push(item);
    else lines.push({ y: item.y, anchors: [item], items: [] });
  }
  const bars = items.filter((item) => item.math && item.raw === '\uE06D');
  const anchoredAt = (y) => lines.some((line) => Math.abs(line.y - y) < 2.5);
  // A radical's top bar must stay on the radical's line; it never encloses a fraction's parts.
  const radicalOf = new Map();
  for (const radical of items.filter((item) => item.math && item.raw === '\uE05C')) {
    const bar = radicalBarFor(radical, bars);
    if (bar) radicalOf.set(bar, radical);
  }
  // A bar capped by a vector head is an arrow over the letters below it, never a fraction.
  const heads = items.filter((item) => item.math && item.raw === '\uE06E');
  const vectorBars = new Set(bars.filter((bar) => heads.some((head) =>
    Math.abs(head.x - (bar.x + bar.width)) <= 3 && Math.abs(head.y - bar.y) <= 3)));
  const fractionBars = bars.filter((bar) => !radicalOf.has(bar) && !vectorBars.has(bar));
  const tallDelimiter = (item) => item.math && /^\\?[()[\]|{}]$/u.test(item.value.trim()) && item.height > 18
    && (!/^\\[{}]$/u.test(item.value.trim()) || items.some((other) => other !== item
      && other.value.trim() === (item.value.trim() === '\\{' ? '\\}' : '\\{')
      && Math.abs(other.y - item.y) < 2.3 && Math.abs(other.height - item.height) < 2.3));
  const placement = (item) => {
    if (radicalOf.has(item)) return placement(radicalOf.get(item));
    if (vectorBars.has(item) || (item.raw === '\uE06E' && heads.includes(item))) return item.y - item.height * 0.45;
    const enclosing = fractionBars.filter((bar) => item === bar || (item.math
      && item.x + item.width / 2 >= bar.x && item.x + item.width / 2 <= bar.x + bar.width
      && Math.abs(item.y - bar.y) < 18
      // A glyph a full text line above a bar belongs to the previous line, not to a numerator.
      && !(item.y - bar.y >= item.height * 1.3 && anchoredAt(item.y)))).sort((a, b) => Math.abs(item.y - a.y) - Math.abs(item.y - b.y)
        || a.width - b.width)[0];
    return enclosing ? enclosing.y + enclosing.height * 0.35
      : /^\\(?:sum|prod)$/u.test(item.value)
        || tallDelimiter(item) ? item.y + item.height * 0.17
        : /^\\int$/u.test(item.value) ? item.y + item.height * 0.14 : item.y;
  };
  for (const item of [...items].sort((a, b) => Number(b.raw === '\uE06D') - Number(a.raw === '\uE06D')
    || b.height - a.height)) {
    const placementY = placement(item);
    const line = [...lines].sort((left, right) => Math.abs(left.y - placementY) - Math.abs(right.y - placementY))[0];
    if (line && Math.abs(line.y - placementY) < Math.max(13,
      ...line.anchors.map((anchor) => anchor.height * 1.7))) line.items.push({ ...item });
    else if (item.math) lines.push({ y: placementY, anchors: [], items: [{ ...item }] });
  }
  for (const line of lines.filter((entry) => !entry.anchors.length)) {
    const limits = line.items.filter((item) => /^\\(?:sum|int|prod)$/u.test(item.value));
    const fractionHeight = Math.max(0, ...line.items.filter((item) => item.raw === '\uE06D').map((item) => item.height));
    const candidates = line.items.filter((item) => !/[\uE05C\uE06D\uE06E]/u.test(item.raw)
      && !tallDelimiter(item) && item.height >= fractionHeight * 0.85
      && Math.abs(placement(item) - item.y) < 2.3
      && !limits.some((limit) => item.height < limit.height * 0.7
        && Math.abs(item.y - placement(limit)) > 2.3
        && Math.abs(item.y - placement(limit)) < limit.height
        && item.x + item.width / 2 >= limit.x - 4 && item.x <= limit.x + limit.width + 5)
      && !/^\\(?:sum|int|prod)/u.test(item.value));
    if (!candidates.length && line.items.some((item) => fractionBars.some((bar) =>
      item.raw === bar.raw && item.x === bar.x && item.y === bar.y))) continue;
    const score = (item) => candidates.filter((other) => Math.abs(other.height - item.height) < 1
      && Math.abs(other.y - item.y) < 1.5).length * Math.max(1, item.height) ** 2;
    const ranked = [...(candidates.length ? candidates : line.items)].sort((left, right) => score(right) - score(left)
      || right.height - left.height || right.width - left.width);
    const primary = ranked[0];
    if (ranked.some((item) => item !== primary
      && score(item) === score(primary) && Math.abs(item.height - primary.height) < 0.5
      && Math.abs(item.width - primary.width) < 0.5
      && Math.abs(item.y - primary.y) > 2.3)) {
      const equalities = line.items.filter((item) => item.math && item.value.trim() === '='
        && !fractionBars.some((bar) => line.items.includes(bar)
          && item.x + item.width / 2 >= bar.x && item.x + item.width / 2 <= bar.x + bar.width));
      if (equalities.length && equalities.every((item) => Math.abs(item.y - equalities[0].y) < 1.5)) {
        line.y = equalities[0].y;
        continue;
      }
      throw new Error('독립 수식 줄의 기준선을 확인할 수 없습니다.');
    }
    line.y = primary.y;
  }
  return lines.sort((left, right) => right.y - left.y);
}

export function lineRuns(line) {
  // Stacked legacy scripts share an x position (¹₁H): superscript first, then subscript.
  const stackRank = (item) => /^[\u00b9\u00b2\u00b3\u2070-\u207f]/u.test(item.value || '') ? 0
    : /^[\u2080-\u209f]/u.test(item.value || '') ? 1 : 2;
  const items = attachTextScripts(recoverEquationItems(line.items, line.y))
    .sort((left, right) => (Math.abs(left.x - right.x) < 0.6 ? 0 : left.x - right.x)
      || stackRank(left) - stackRank(right) || right.y - left.y);
  const runs = [];
  let previous = null;
  // 5E 기출 복원: 수식 글꼴의 작은 글자가 바로 앞 수식 글자보다 내려가/올라가 있으면 아래/위첨자(λ_A, v_B).
  let base = null, script = null;
  for (const item of items) {
    if (!item.value) continue;
    if (item.math && base && previous?.math && !item.recovered && /^[A-Za-z0-9+−-]{1,3}$/u.test(item.value.trim())
      && item.height > 0 && item.height <= base.height * 0.8
      && item.x - (previous.x + previous.width) >= -1 && item.x - (previous.x + previous.width) <= 1.6
      && Math.abs(item.y - base.y) >= 1.2 && Math.abs(item.y - base.y) <= base.height * 0.7) {
      const mark = item.y < base.y ? '_' : '^';
      const last = runs.at(-1);
      if (last?.kind === 'equation') {
        if (script && script.mark === mark && Math.abs(script.y - item.y) < 1) last.script = last.script.replace(/\}$/u, `${item.value.trim()}}`);
        else last.script += `${mark}{${item.value.trim()}}`;
        script = { mark, y: item.y };
        previous = item;
        continue;
      }
    }
    script = null;
    if (item.math && !(base && item.height <= base.height * 0.8 && Math.abs(item.y - base.y) >= 1.2)) base = item;
    if (!item.math) base = null;
    const kind = item.math ? 'equation' : 'text';
    const value = item.value;
    const gap = previous ? item.x - previous.x - previous.width : 0;
    const spaced = previous && gap > (previous.math && item.math ? 5 : Math.max(1.5, Math.min(previous.height, item.height) * 0.2))
      && !attachedScript.test(value) && !/\s$/u.test(previous.value) && !/^\s/u.test(value);
    if (spaced) {
      if (runs.at(-1)?.kind === 'text') runs.at(-1).value += ' ';
      else runs.push({ kind: 'text', value: ' ' });
    }
    const last = runs.at(-1);
    if (last?.kind === kind) {
      if (kind === 'equation') last.script += (/\\[A-Za-z]+$/u.test(last.script) && /^[A-Za-z]/u.test(value) ? ' ' : '') + value;
      else last.value += value;
    } else runs.push(kind === 'equation' ? { kind, script: value } : { kind, value });
    previous = item;
  }
  return runs;
}

/**
 * Old papers set small fractions in the text font with the rule drawn separately: a numerator
 * and a denominator of digits/letters stacked on the same x right after a choice marker or in a
 * row of choices. Two such items with no text between them and a vertical gap of about one
 * line height become one editable \frac equation.
 */
export function stackTextFractions(items) {
  // Only numbers and single Latin/Greek letters: Hangul stacked this way is a table header or a
  // vertically written label, and words over words are ratio fractions this rule can't verify.
  const token = /^(?:\d{1,3}|[A-Za-zα-ωπ])$/u;
  // A radical glyph printed just before a denominator (1/√2) belongs to it.
  const radicalBefore = (lower) => items.find((item) => !item.math && item.value.trim() === '√'
    && Math.abs(item.y - lower.y) < 1 && lower.x - item.x > 0 && lower.x - item.x < 12);
  const used = new Set();
  const out = [];
  const candidates = items.filter((item) => !item.math && token.test(item.value.trim()));
  for (const upper of candidates) {
    if (used.has(upper)) continue;
    const lower = candidates.find((other) => other !== upper && !used.has(other)
      // Numerator and denominator baselines sit about 1.0~1.35 line heights apart.
      && upper.y - other.y > other.height * 0.9 && upper.y - other.y < other.height * 1.45
      // Parts are centred on each other (1 over 16) or start together (9 over 4).
      && (Math.abs(other.x - upper.x) < 1.2
        || Math.abs((other.x + other.width / 2) - (upper.x + upper.width / 2)) < 1.2 || (radicalBefore(other)
        && upper.x >= radicalBefore(other).x - 1 && upper.x + upper.width <= other.x + other.width + 1)));
    if (!lower) continue;
    const radical = Math.abs(lower.x - upper.x) < 1.2 ? null : radicalBefore(lower);
    const middle = (upper.y + lower.y) / 2;
    // A fraction sits in a row of choices: its line has a choice marker to the left.
    const marker = items.find((item) => /^[①②③④⑤]/u.test(item.value.trim()) && Math.abs(item.y - middle) < 2.6
      && item.x < upper.x && upper.x - item.x < 40);
    if (!marker) continue;
    // A real stacked fraction has nothing else between its two parts at the same x.
    if (items.some((item) => item !== upper && item !== lower && item !== radical && item.x < upper.x + upper.width
      && item.x + item.width > upper.x && item.y < upper.y && item.y > lower.y)) continue;
    // It sits on the line between its parts: an item on that baseline is to its left or right.
    if (!items.some((item) => item !== upper && item !== lower && Math.abs(item.y - middle) < 2.6)) continue;
    used.add(upper); used.add(lower); if (radical) used.add(radical);
    const x = Math.min(upper.x, lower.x, radical?.x ?? Infinity);
    const denominator = radical ? `\\sqrt{${lower.value.trim()}}` : lower.value.trim();
    out.push({ ...upper, x, y: middle, width: Math.max(upper.x + upper.width, lower.x + lower.width) - x, parts: [upper, lower, radical].filter(Boolean),
      raw: upper.raw + lower.raw, value: `\\frac{${upper.value.trim()}}{${denominator}}`, math: true, recovered: true });
  }
  // Accept a row only when every stacked item near its markers became a fraction; a partial
  // merge means the choices are expressions this rule can't read (m_A+m_B over 2d, V over S).
  const rows = new Map();
  for (const fraction of out) {
    const key = Math.round(fraction.y / 3);
    rows.set(key, [...(rows.get(key) || []), fraction]);
  }
  const leftover = (fraction) => items.some((item) => !item.math && !used.has(item) && item.value.trim()
    && !/^[①②③④⑤]/u.test(item.value.trim()) && Math.abs(item.y - fraction.y) > 2.6 && Math.abs(item.y - fraction.y) < fraction.height * 1.2
    && Math.abs(item.x - fraction.x) < 60);
  const rejected = new Set([...rows.values()].filter((row) => row.some(leftover)).flat());
  const kept = out.filter((fraction) => !rejected.has(fraction));
  const restored = new Set(items.filter((item) => used.has(item) && [...rejected].some((fraction) => fraction.parts?.includes(item))));
  return [...items.filter((item) => !used.has(item) || restored.has(item)), ...kept];
}

export function buildLiveStructure(question, pdf, glyphs, options = {}) {
  // --- data-table hook: keep cell equations out of the surrounding line grouping.
  const flow = tableFlow(extractTables(clipItems(question, pdf, glyphs), pdf, question), pdf.pageHeight,
    (items) => findLines(recoverStretchyBrackets(recoverPiecewiseItems(ruledTextFractions(items, clipItems.lastPrimitives, pdf.pageHeight)))).flatMap((line, index) =>
      [...(index ? [{ kind: 'text', value: '\n' }] : []), ...lineRuns(line).flatMap((run, at, runs) => {
        // A word fraction is an unbreakable equation. Put adjacent cell notes on
        // their own line so the imported core cannot push them out of the cell.
        if (run.kind !== 'equation' || !/\\frac\{[\s\S]*\\text\{/u.test(run.script)) return [run];
        return [...(at && runs[at - 1].kind === 'text' && runs[at - 1].value.trim() ? [{ kind: 'text', value: '\n' }] : []),
          run, ...(runs[at + 1]?.kind === 'text' && runs[at + 1].value.trim() ? [{ kind: 'text', value: '\n' }] : [])];
      })]));
  const lines = findLines(stackTextFractions(recoverStretchyBrackets(recoverPiecewiseItems(
    ruledTextFractions(flow.items, clipItems.lastPrimitives, pdf.pageHeight)))));
  const figureDropped = clipItems.lastDropped > 0;
  const blocks = [];
  const tops = new WeakMap();
  let sourceTop = 0;
  let sourceLine;
  const append = (block) => {
    if (block.role !== 'choice') block.sourceLine = sourceLine;
    tops.set(block, sourceTop); blocks.push(block);
  };
  let figures = [];
  let figureWarning = '';
  if (options.includeImages !== false) {
    try { figures = questionFigures(question, pdf, clipItems.lastRegions); }
    catch (error) { figureWarning = `그림 영역 분석에 실패해 그림을 제외했습니다: ${error instanceof Error ? error.message : String(error)}`; }
  }
  let role = 'stem';
  let choiceCount = 0;
  let markers = 0;
  const compact = (value) => value.normalize('NFC').replace(/[\s`]/gu, '');
  const indexText = compact(question.questionText || question.text || '');
  const markerItems = lines.flatMap((line) => line.items.filter((item) => !item.math && /^[①②③④⑤]$/u.test(item.value.trim())));
  const centeredMarkers = markerItems.filter((marker) => lines.find((line) => line.items.includes(marker))
    .items.every((item) => item === marker || !item.value.trim()));
  // Table options center their marker between two text baselines. Move only the marker
  // to the immediately preceding indented line, leaving every text item in reading order.
  if ((question.subject === 'kor' || /_kor_/u.test(question.id || '')) && centeredMarkers.length >= 2) {
    for (const marker of markerItems) {
      const at = lines.findIndex((line) => line.items.includes(marker));
      const upper = lines[at - 1];
      if (!upper || upper.items.some((item) => /[①②③④⑤]/u.test(item.value))
        || upper.y - marker.y > marker.height * 1.05 || upper.y - marker.y < 3
        || upper.items.some((item) => item.x < marker.x + marker.width - 1)) continue;
      lines[at].items = lines[at].items.filter((item) => item !== marker);
      upper.items.push({ ...marker, y: upper.y });
    }
  }
  const sourceLines = lines.filter((line) => line.items.length).map((line) => ({ line,
    plain: [...line.items].sort((a, b) => a.x - b.x).map((item) => item.value).join('') }));
  const allMarkers = sourceLines.map(({ plain }) => (plain.match(/[①②③④⑤]/gu) || []).join('')).join('');
  // A circled endpoint pair belongs to the displayed sequence, not the answers.
  // Require a separate complete answer row and no earlier higher-numbered labels.
  const answerRow = /^[①②]+①②③④⑤$/u.test(allMarkers)
    && sourceLines.some(({ plain }) => /^\s*①-.*-②\s*$/u.test(plain))
    ? sourceLines.findLast(({ plain }) => /^\s*①/u.test(plain)
      && (plain.match(/[①②③④⑤]/gu) || []).join('') === '①②③④⑤')?.line : null;
  const inlineChoices = question.responseType !== 'short_answer'
    && (question.subject === 'eng' || /_eng_/u.test(question.id || ''))
    && allMarkers === '①②③④⑤'
    && sourceLines.some(({ plain }) => /^[^①②③④⑤]*[A-Za-z][^①②③④⑤]*[①②③④⑤]/u.test(plain)
      && (plain.split(/[①②③④⑤]/u)[0].match(/[A-Za-z]/gu) || []).length >= 8);
  if (inlineChoices) {
    let afterFifth = false;
    for (let at = 0; at < lines.length - 1; at += 1) {
      const line = lines[at], next = lines[at + 1];
      if (line.items.some((item) => item.value.includes('⑤'))) afterFifth = true;
      if (!afterFifth || !line.items.length || !next.items.length) continue;
      const items = [...line.items, ...next.items].sort((a, b) => a.x - b.x);
      // Glossary stars and Korean definitions can have slightly different baselines.
      // Rejoin only the printed order corroborated by the question's index text.
      if (items.some((item) => item.math) || line.y - next.y > Math.max(...items.map((item) => item.height)) * 0.35
        || !indexText.includes(compact(items.map((item) => item.value).join('')))) continue;
      line.items = items;
      next.items = [];
    }
  }
  let previousLine = null;
  let fifthX = null;
  let inlineFifthSeen = false;
  const ownNumber = new RegExp(`^\\s*${question.no}\\.(?!\\d)`, 'u');
  const opening = sourceLines.find(({ plain }) => ownNumber.test(plain));
  const questionLeft = opening ? Math.min(...opening.line.items.map((item) => item.x)) : question.box?.[0];
  for (const line of lines) {
    sourceTop = pdf.pageHeight - line.y;
    if (!line.items.length) continue;
    // Old KICE fonts insert a backtick as a thin spacer; it is never printed.
    const runs = lineRuns(line).map((run) => run.kind === 'text' ? { ...run, value: run.value.replace(/\u0060/gu, '') } : run)
      .filter((run) => run.kind !== 'text' || run.value);
    const plain = runs.map((run) => run.kind === 'text' ? run.value : '').join('').trim();
    sourceLine = { left: Math.min(...line.items.map((item) => item.x)),
      right: Math.max(...line.items.map((item) => item.x + item.width)), y: line.y,
      height: Math.max(...line.items.filter((item) => !item.math).map((item) => item.height), 1),
      columnRight: question.box?.[2] || pdf.pageWidth,
      region: JSON.stringify([question.pdfFile, question.page, question.box]), opening: ownNumber.test(plain) };
    if (!runs.length || /^[<〈]\s*보\s*기\s*[>〉]$/u.test(plain)) continue;
    if ((choiceCount === 5 || inlineFifthSeen) && /\d\s*권\s*중\s*\d\s*권/u.test(plain)) break;
    const nextNumber = plain.match(/^(\d{1,2})\.(?!\d)/u)?.[1]
      || plain.match(/^\[\s*(\d{1,2})\s*[～~∼〜-]\s*\d{1,2}\s*\]/u)?.[1];
    if ((choiceCount === 5 || inlineFifthSeen) && Number(nextNumber) === Number(question.no) + 1
      && Math.abs(Math.min(...line.items.map((item) => item.x)) - questionLeft) <= 4
      && !indexText.includes(compact(plain))) break;
    if (choiceCount === 5) {
      const last = blocks.findLast((block) => block.role === 'choice');
      const prior = compact(last.runs.map((run) => run.value || run.script).join(''));
      const next = compact(plain);
      const suffix = indexText.slice(indexText.lastIndexOf('⑤') + 1);
      const x = Math.min(...line.items.map((item) => item.x));
      const h = Math.max(...line.items.map((item) => item.height));
      if (!next || /[①②③④⑤]/u.test(plain) || !previousLine || previousLine.y - line.y > h * 2.6
        || x < fifthX - 2 || !indexText.includes('⑤')
        || !(suffix.includes(prior + next) || suffix.startsWith(next))) break;
    }
    if (/저작권은\s*한국교육과정평가원|확인\s*사항|한글과컴퓨터뷰어/u.test(plain) || (/^\d{1,2}$/u.test(plain) && runs.every((run) => run.kind === 'text'))) continue;
    const indexedList = blocks.length && /^\d{1,2}\.(?!\d)/u.test(plain)
      && !ownNumber.test(plain) && indexText.includes(compact(plain));
    if (/^\d{1,2}\./u.test(plain) && !indexedList) {
      const first = runs.find((run) => run.kind === 'text');
      first.value = first.value.replace(/^\s*\d{1,2}\.\s*/u, '');
    }
    if (inlineChoices) {
      if (plain.includes('⑤')) inlineFifthSeen = true;
      append({ role: 'stem', label: '', runs });
      continue;
    }
    previousLine = line;
    if (plain.includes('⑤')) fifthX = Math.min(...line.items.filter((item) => item.value.includes('⑤')).map((item) => item.x));
    if (/^이에 대한|^이에 관한|^이에 대해/u.test(plain)) role = 'ask';
    if (/^[ㄱㄴㄷ]\./u.test(plain)) {
      role = 'bogi';
      const label = plain[0];
      const first = runs.find((run) => run.kind === 'text');
      first.value = first.value.replace(/^\s*[ㄱㄴㄷ]\.\s*/u, '');
      append({ role, label, runs });
      continue;
    }
    let current = role;
    let currentRuns = [];
    if (answerRow && line.y > answerRow.y) {
      if (/^[①②③④⑤]/u.test(plain) && blocks.at(-1)?.role === role) {
        blocks.at(-1).runs.push({ kind: 'text', value: ' ' }, ...runs);
      } else append({ role, label: '', runs });
      continue;
    }
    const lineHasMarker = runs.some((run) => run.kind === 'text' && /[①②③④⑤]/u.test(run.value));
    if (role === 'choice' && !lineHasMarker) {
      // Wrapped choice text or figure labels continue the previous choice.
      const last = blocks.findLast((block) => block.role === 'choice');
      if (last) last.runs = appendLineRuns(last.runs, runs, question.questionText || question.text || '');
      continue;
    }
    const flush = () => {
      if (!currentRuns.length) return;
      if (current === 'choice') {
        const label = '①②③④⑤'[choiceCount++];
        const own = !currentRuns.some((run) => run.kind === 'equation' ? run.script?.trim() : run.value?.trim());
        append({ role: current, label, runs: currentRuns, own });
      } else {
        append({ role: current, label: '', runs: currentRuns });
      }
      currentRuns = [];
    };
    for (const run of runs) {
      if (run.kind !== 'text') { currentRuns.push(run); continue; }
      const parts = run.value.split(/([①②③④⑤])/u);
      for (const part of parts) {
        if (!part) continue;
        if (/^[①②③④⑤]$/u.test(part)) {
          flush();
          if (current === 'choice' && !currentRuns.length && role === 'choice' && markers > choiceCount) {
            append({ role: 'choice', label: '①②③④⑤'[choiceCount++], runs: [], own: true });
          }
          markers += 1;
          current = 'choice';
          role = 'choice';
        } else currentRuns.push({ kind: 'text', value: part });
      }
    }
    flush();
    if (current === 'choice' && markers > choiceCount) {
      append({ role: 'choice', label: '①②③④⑤'[choiceCount++], runs: [], own: true });
    }
  }
  const notes = ['원본 PDF에서 브라우저가 변환했습니다. 그림·도표는 생략했습니다.'];
  if (figureWarning) notes.push(figureWarning);
  const choices = blocks.filter((block) => block.role === 'choice');
  // Drawn choices keep only axis ticks or stray labels, even after wrapped lines are joined.
  const token = (run) => run.kind === 'equation' ? run.script.trim() : run.value.trim();
  // Page watermarks such as "물리학 II" can bleed into drawn choices beside the graph.
  // Graph axes add short labels like "x 0 시간 B"; none of them is longer than a word.
  const drawn = (block) => block.runs.every((run) => run.kind === 'text'
    && token(run).split(/\s+/u).every((word) => /^(?:[\d.,()+\-÷*]*|\p{L}|II|Ⅱ|I|Ⅰ|시간|위치|속도|거리)$/u.test(word)));
  const empty = (block) => block.runs.every((run) => !token(run));
  // A choice with nothing on its own marker line means the options are drawn; the other
  // "choices" then only hold leftovers of the drawings (axis names, legend words).
  const graphicLeftover = (block) => drawn(block) || block.runs.every((run) => run.kind === 'text'
    && !/[.?!다요]\s*$/u.test(token(run)) && token(run).length <= 40);
  // Figure-label removal can leave a drawn choice with nothing at all; the others then hold
  // only the unlabeled leftovers of their charts (short legend words and numbers).
  const chartLeftover = (block) => block.runs.every((run) => run.kind === 'text'
    && token(run).split(/\s+/u).every((word) => word.length <= 12 && !/[.?!]$|다$/u.test(word)));
  if (question.responseType !== 'short_answer' && markers === 5 && choices.length === 5
    && ((choices.some((block) => block.own && drawn(block)) && choices.every(drawn))
      || (choices.filter((block) => block.own && empty(block)).length >= 2 && choices.every(graphicLeftover))
      || (figureDropped && choices.some(empty) && choices.every(chartLeftover)))) {
    // Graph or diagram choices have only their ①~⑤ labels as text. Keep the editable
    // stem and mark each choice for comparison with the original.
    blocks.splice(0, blocks.length, ...blocks.filter((block) => block.role !== 'choice'),
      ...[...'①②③④⑤'].map((label) => ({ role: 'choice', label,
        runs: [{ kind: 'text', value: '(선지는 원본 참고)' }] })));
    choiceCount = 5;
    notes.push('선지가 그림이거나 자동으로 옮길 수 없어 선지 자리에는 원본 참고 표시만 넣었습니다.');
  }
  if ((question.responseType !== 'short_answer' && !inlineChoices && choiceCount !== 5)
    || !blocks.some((block) => block.role === 'stem')) {
    throw new Error('원본 PDF에서 본문과 선지 다섯 개를 모두 분리하지 못했습니다.');
  }
  // --- data-table hook
  blocks.splice(0, blocks.length, ...restoreTableBlocks(blocks, flow.tables));
  return { schema: 'exam-editable-v1', questionId: question.id,
    subject: question.subject, flowReference: question.questionText || question.text || '',
    title: question.title, number: question.no, sourcePdf: question.pdfFile,
    page: question.page, status: 'needs_review', blocks,
    contentRegions: observedContentRegions(question, pdf, clipItems.lastPrimitives, clipItems.lastRegions, figures, blocks, options.includeImages !== false),
    figureFallbacks: figures.map((figure) => ({ ...figure, afterBlock: blocks.findLastIndex((block) =>
      tops.has(block) && tops.get(block) <= (figure.flowBox || figure.box)[3] + 2) })),
    notes, ...(inlineChoices ? { inlineChoices: true } : {}),
    // --- frame hook (5E 기출 복원): 문항 영역 안의 큰 사각형·선. 조건·실험 상자 판별에 쓴다. 좌표: 위가 0.
    pageHeight: pdf.pageHeight,
    // 줄마다 큰 간격(글자 높이쯤)으로 나눈 칸: 선지표 머리줄·선지 줄의 열 위치. y는 아래가 0.
    lineCells: lines.filter((line) => line.items.length).map((line) => {
      try {
        const items = [...line.items].filter((item) => item.math || String(item.value || '').trim()).sort((a, b) => a.x - b.x);
        const h = Math.max(6, ...items.filter((item) => !item.math).map((item) => item.height));
        const group = (gap) => {
          const cells = [];
          for (const item of items) {
            const last = cells.at(-1);
            if (last && item.x - last.x1 <= gap) { last.items.push(item); last.x1 = Math.max(last.x1, item.x + item.width); }
            else cells.push({ x0: item.x, x1: item.x + item.width, items: [item] });
          }
          return cells.map((cell) => ({ x0: cell.x0, x1: cell.x1, runs: lineRuns({ ...line, items: cell.items }) }));
        };
        return { y: line.y, height: h, cells: group(h * 1.1), words: group(Math.max(1.2, h * 0.22)) };
      } catch { return { y: line.y, cells: [] }; }
    }),
    frames: (clipItems.lastPrimitives || []).filter((p) => (p.type === 'rect' || p.type === 'line')
      && p.box[0] >= (question.box?.[0] ?? 0) - 4 && p.box[2] <= (question.box?.[2] ?? Infinity) + 4
      && p.box[1] >= (question.box?.[1] ?? 0) - 4 && p.box[3] <= (question.box?.[3] ?? Infinity) + 4
      && Math.max(p.box[2] - p.box[0], p.box[3] - p.box[1]) >= 40)
      .map((p) => ({ type: p.type, box: p.box.map((v) => Math.round(v * 10) / 10), rounded: !!p.rounded, paint: p.paint, fill: p.fill || null, dash: !!p.dash })) };
}

/** Finds the question on its page from the printed number when the indexed box is wrong. */
export function questionBoxFromPage(question, pdf) {
  const height = pdf.pageHeight;
  const items = pdf.content.items.filter((item) => item.str?.trim() && item.transform
    && !/^(?:HyhwpEQ|HYhwpEQ)/u.test(pdf.fonts[item.fontName]?.name?.split('+').at(-1) || ''));
  const top = (item) => height - item.transform[5];
  const starts = items.map((item) => ({ item, no: Number(item.str.match(/^\s*(\d{1,2})\.(?!\d)/u)?.[1]) }))
    .filter(({ item, no }) => no >= 1 && no <= 45 && !items.some((other) => other !== item
      && Math.abs(other.transform[5] - item.transform[5]) < 2.5
      && other.transform[4] < item.transform[4] - 1 && other.transform[4] > item.transform[4] - 90));
  const lefts = [];
  for (const x of starts.map(({ item }) => item.transform[4]).sort((a, b) => a - b)) {
    if (!lefts.length || x - lefts.at(-1) > 40) lefts.push(x);
  }
  const width = pdf.pageWidth || Math.max(...items.map((item) => item.transform[4] + item.width));
  const column = (x) => lefts.findLastIndex((left) => x >= left - 20);
  const matches = starts.filter(({ no }) => no === question.no);
  if (!matches.length) return null;
  const [x0, y0] = question.box || [0, 0];
  const { item } = [...matches].sort((a, b) => Math.hypot(a.item.transform[4] - x0, top(a.item) - y0)
    - Math.hypot(b.item.transform[4] - x0, top(b.item) - y0))[0];
  const index = column(item.transform[4]);
  const left = lefts[index];
  const right = lefts[index + 1] ? lefts[index + 1] - 8 : width;
  const below = starts.filter((entry) => entry.item !== item && column(entry.item.transform[4]) === index
    && top(entry.item) > top(item) + 5).map((entry) => top(entry.item));
  const bottom = below.length ? Math.min(...below) - 12 : height - 30;
  return [left - 6, top(item) - 12, right, bottom];
}

function locate(question, pdf) {
  const box = questionBoxFromPage(question, pdf);
  if (!box || box.every((value, index) => Math.abs(value - (question.box?.[index] ?? NaN)) < 2)) return null;
  return { ...question, box };
}

export async function convertQuestionNow(question, options = {}) {
  const check = () => options.signal?.throwIfAborted();
  const build = (item, page, glyphs) => {
    check();
    return buildLiveStructure(item, page, glyphs, options);
  };
  check();
  const pdf = await readQuestionPdf(question, options);
  check();
  const primary = async () => {
    try {
      const glyphs = await verifiedGlyphMap(question, pdf);
      return build(question, pdf, glyphs);
    } catch (error) {
      // Older indexes sometimes point at the wrong column or stop before the choices.
      const located = locate(question, pdf);
      if (!located) throw error;
      const glyphs = await verifiedGlyphMap(located, pdf);
      check();
      const structure = build(located, pdf, glyphs);
      structure.notes.push('색인의 문항 영역이 원본과 달라 원본 PDF의 문항 번호 위치로 다시 찾았습니다.');
      return structure;
    }
  };
  // --- question-region hook: continuation into the next column/page, extended boxes and
  // picture choices, tried only when the primary result fails to split or has an empty choice.
  return recoverQuestionRegion(question, pdf, primary, { build, glyphMap: verifiedGlyphMap,
    readPage: (page) => { check(); return readQuestionPdf({ ...question, page }, options); } });
  // --- end question-region hook
}

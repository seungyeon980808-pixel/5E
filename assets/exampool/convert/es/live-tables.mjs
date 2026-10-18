import { drawingPrimitives, tableGrids, textItemBox } from './pdf-drawings.mjs?v=readability-20261004-4';
import { recoverEquationItems } from './live-equations.mjs';

const contains = (box, x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
const pdfItem = (item) => ({ str: item.value, width: item.width, height: item.height,
  transform: [1, 0, 0, 1, item.x, item.y] });

/** Partition by identity first: an ambiguous cell assignment leaves the whole table in flow. */
export function partitionTableItems(items, grids, pageHeight) {
  const tables = [];
  const used = new Set();
  const choiceTop = Math.min(Infinity, ...items.filter((item) => /[①②③④⑤]/u.test(item.value))
    .map((item) => pageHeight - item.y - item.height * 0.85));
  for (const grid of grids) {
    if (grid.box[3] >= choiceTop) continue;
    const cells = grid.cells.map((cell) => ({ ...cell, items: [] }));
    const inside = items.filter((item) => {
      const b = textItemBox(pdfItem(item), pageHeight).box;
      return contains(grid.box, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    });
    let safe = inside.length > 0;
    for (const item of inside) {
      const b = textItemBox(pdfItem(item), pageHeight).box;
      const owners = cells.filter((cell) => contains(cell.box, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2));
      if (used.has(item) || owners.length !== 1) { safe = false; break; }
      owners[0].items.push(item);
    }
    if (!safe) continue;
    for (const item of inside) used.add(item);
    tables.push({ box: grid.box, grid, cells });
  }
  return { tables, rest: items.filter((item) => !used.has(item)) };
}

export function extractTables(items, pdf, question) {
  if (!pdf.operations || !pdf.OPS) return { tables: [], rest: items };
  const primitives = drawingPrimitives(pdf.operations, pdf.OPS, pdf.pageHeight);
  // Use decoded positioned equation glyphs too: pdf.js's text content can omit entire cells.
  const grids = tableGrids(primitives, items.map(pdfItem), pdf.pageHeight, question.box);
  return partitionTableItems(items, grids, pdf.pageHeight);
}

/** A reserved anchor passes through the existing role/line parser without changing that parser. */
export function tableFlow(extracted, pageHeight, toRuns) {
  const rest = [...extracted.rest];
  const tables = extracted.tables.flatMap((table, index) => {
    const rows = Array.from({ length: table.grid.rows }, () => Array.from({ length: table.grid.cols }, () => []));
    try {
      for (const cell of table.cells) {
        // A centred equation-only cell supplies its own baseline when a fraction has equal-sized parts.
        const height = Math.max(0, ...cell.items.map((item) => item.height));
        const baseline = pageHeight - (cell.box[1] + cell.box[3]) / 2 - height * 0.325;
        const items = cell.items.length && cell.items.every((item) => item.math) && cell.items.some((item) => /\uE06D/u.test(item.raw))
          ? recoverEquationItems(cell.items, baseline) : cell.items;
        rows[cell.row][cell.col] = toRuns(items).map((run) => run.kind === 'text'
          ? { ...run, value: run.value.replace(/\u0060/gu, '').replace(/(^|\n)∙(?=[가-힣])/gu, '$1·') } : run);
      }
    } catch {
      // Table extraction is optional: retain today's complete line flow if a cell is ambiguous.
      rest.push(...table.cells.flatMap((cell) => cell.items));
      return [];
    }
    const xs = [...new Set(table.grid.cells.flatMap((cell) => [cell.box[0], cell.box[2]]))].sort((a, b) => a - b);
    return [{ kind: 'table', rows, spans: table.cells.map(({ row, col, rowSpan, colSpan }) => ({ row, col, rowSpan, colSpan })),
      widths: xs.slice(1).map((x, col) => x - xs[col]), box: table.box, marker: `\uFFFCtable${index}\uFFFC` }];
  });
  // Captions centred just below their own ruled panel move with that panel. Keeping
  // them in the page-wide baseline flow would combine '(가) (나)' after both tables.
  for (const table of tables) {
    const candidates = rest.filter((item) => item.value.trim()
      && item.x + item.width / 2 > table.box[0] && item.x + item.width / 2 < table.box[2]
      && pageHeight - item.y - table.box[3] >= 0
      && pageHeight - item.y - table.box[3] <= Math.max(18, item.height * 1.8)).sort((a,b) => a.x-b.x);
    if (!candidates.length || candidates.some((item, i) => Math.abs(item.y-candidates[0].y)>1.5
      || (i && item.x-candidates[i-1].x-candidates[i-1].width>2))) continue;
    const caption = candidates.map((item) => item.value.trim()).join('');
    if (!/^\([가-힣]\)$/u.test(caption)) continue;
    const middle = (candidates[0].x + candidates.at(-1).x + candidates.at(-1).width)/2;
    // One caption cannot belong to overlapping/nested tables.
    if (tables.some((other) => other !== table && middle > other.box[0] && middle < other.box[2]
      && Math.abs(other.box[3] - table.box[3]) < 4)) continue;
    table.caption = caption;
    for (const item of candidates) rest.splice(rest.indexOf(item), 1);
  }
  return { tables, items: [...rest, ...tables.map((table) => ({ x: table.box[0],
    y: pageHeight - (table.box[1] + table.box[3]) / 2, width: 1, height: 1,
    value: table.marker, raw: table.marker, math: false }))] };
}

export function restoreTableBlocks(blocks, tables) {
  return tables.reduce((current, table) => current.flatMap((block) => {
    if (!block.runs.some((run) => run.kind === 'text' && run.value.includes(table.marker))) return [block];
    if (block.role === 'choice') throw new Error('선지 안의 표는 변환할 수 없습니다.');
    const { marker, caption, ...data } = table;
    const result = [];
    let runs = [];
    for (const run of block.runs) {
      if (run.kind !== 'text' || !run.value.includes(marker)) { runs.push(run); continue; }
      const [before, after] = run.value.split(marker);
      if (before.trim()) runs.push({ kind: 'text', value: before });
      if (runs.length) result.push({ ...block, runs });
      result.push({ ...data, role: block.role, label: '', runs: [] });
      if (caption) result.push({ role: block.role, label: '', runs: [{ kind: 'text', value: caption }] });
      runs = after.trim() ? [{ kind: 'text', value: after }] : [];
    }
    if (runs.length) result.push({ ...block, runs });
    return result;
  }), blocks);
}

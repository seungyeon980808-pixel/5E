// Display-only bounds. Conversion keeps the indexed regions and their original coordinates.
// Retain the column width so shorter questions do not acquire larger type in the preview.
export const PREVIEW_VERTICAL_PADDING_PT = 8;

export function previewQuestionBox(question, content, pageHeight) {
  const box = question.displayBox || question.box;
  if (!Array.isArray(box) || box.length !== 4) return box;
  const starts = (content?.items || []).filter((item) => item.transform
    && /^\s*(?:\d{1,2}\.(?!\d)|\[\s*\d{1,2}\s*[～~∼〜-]\s*\d{1,2}\s*\])/u.test(item.str || ''))
    .map((item) => ({ item, x: item.transform[4], baseline: pageHeight - item.transform[5],
      height: item.height || Math.hypot(item.transform[2], item.transform[3]) }));
  const own = starts.filter(({ item, x, baseline }) => Number(item.str.match(/^\s*(\d{1,2})\./u)?.[1]) === question.no
    && x >= box[0] && x < box[2] && baseline >= box[1] - 8 && baseline <= box[1] + 32)
    .sort((a, b) => Math.abs(a.baseline - box[1]) - Math.abs(b.baseline - box[1]))[0];
  // A separately displayed common passage has no question number at its opening.
  if (!own) return box;
  const next = starts.filter(({ x, baseline, height }) => Math.abs(x - own.x) <= 4
    && baseline > own.baseline + own.height && height >= own.height * 0.8)
    .sort((a, b) => a.baseline - b.baseline)[0];
  if (!next) return box;
  return [box[0], box[1], box[2], Math.min(box[3], next.baseline - next.height - 4)];
}

export function previewPaperEnd(content, pageHeight, pageWidth) {
  const items = (content?.items || []).filter((item) => item.str?.trim() && item.transform);
  const rows = [];
  for (const item of items) {
    const baseline = pageHeight - item.transform[5];
    const height = item.height || Math.hypot(item.transform[2], item.transform[3]);
    const top = baseline - height;
    if (top < pageHeight * 0.75) continue;
    let row = rows.find((entry) => Math.abs(entry.baseline - baseline) < 2);
    if (!row) rows.push(row = { baseline, top, items: [] });
    row.top = Math.min(row.top, top);
    row.items.push(item);
  }
  let end = pageHeight;
  for (const row of rows) {
    const text = row.items.sort((a, b) => a.transform[4] - b.transform[4])
      .map((item) => item.str).join('').normalize('NFC').replace(/\s/gu, '');
    const copyright = row.top > pageHeight * 0.85
      && /^[※*]?이문제지에관한저작권은한국교육과정평가원에있습니다\.?$/u.test(text);
    if (!copyright && !(row.top > pageHeight * 0.8 && /^[※*]?확인사항$/u.test(text))) continue;
    // The confirmation heading sits inside a ruled box; exclude its top stroke too.
    end = Math.min(end, row.top - (copyright ? 4 : 12));
    if (!copyright) continue;
    // KICE prints the sheet/total count diagonally in a small box at the gutter.
    // It is furniture only when paired across the gutter immediately above a known footer.
    const numbers = items.filter((item) => /^\d{1,2}$/u.test(item.str.trim())
      && Math.abs(item.transform[4] - pageWidth / 2) < pageWidth * 0.06
      && pageHeight - item.transform[5] <= row.baseline
      && pageHeight - item.transform[5] >= row.baseline - 40);
    const left = numbers.find((item) => item.transform[4] < pageWidth / 2);
    const right = numbers.find((item) => item.transform[4] >= pageWidth / 2);
    if (left && right) {
      end = Math.min(end, ...[left, right].map((item) => pageHeight - item.transform[5]
        - (item.height || Math.hypot(item.transform[2], item.transform[3])) - 4));
    }
  }
  return end;
}

export function previewCropBounds({ data, width, height }, { scale = 1, box, paperEnd = Infinity } = {}) {
  const full = [0, 0, width, height];
  if (!width || !height) return full;
  const padding = Math.max(2, Math.ceil(4 * scale));
  const limit = box ? Math.min(height, Math.ceil((paperEnd - box[1]) * scale)) : height;
  if (limit <= 0) return full;
  const ink = (x, y) => {
    const offset = (y * width + x) * 4;
    return data[offset + 3] > 127
      && Math.min(data[offset], data[offset + 1], data[offset + 2]) < 245;
  };
  const rowInk = (y) => {
    let count = 0;
    for (let x = 0; x < width; x += 1) if (ink(x, y)) count += 1;
    return count;
  };
  let left = 0, right = width;
  const band = Math.max(1, Math.ceil(width * 0.025));
  // A long rule at a column edge is page furniture. A closed passage/table frame is not.
  for (const fromLeft of [true, false]) {
    for (let offset = 0; offset < band; offset += 1) {
      const x = fromLeft ? offset : width - offset - 1;
      let first = -1, last = -1, count = 0;
      for (let y = 0; y < limit; y += 1) if (ink(x, y)) {
        if (first < 0) first = y;
        last = y; count += 1;
      }
      if (count < limit * 0.85 || first > padding) continue;
      const connection = (y) => {
        for (let row = Math.max(0, y - 1); row <= Math.min(limit - 1, y + 1); row += 1)
          if (rowInk(row) > width * 0.25) return true;
        return false;
      };
      if (connection(first) && connection(last)) continue;
      if (fromLeft) left = x + 1;
      else right = x;
    }
  }
  if (left >= right) return full;
  let top = limit, bottom = -1;
  for (let y = 0; y < limit; y += 1) {
    for (let x = left; x < right; x += 1) if (ink(x, y)) {
      top = Math.min(top, y); bottom = y; break;
    }
  }
  if (bottom < 0) return full;
  return [left, Math.max(0, top - padding), right, Math.min(limit, bottom + padding + 1)];
}

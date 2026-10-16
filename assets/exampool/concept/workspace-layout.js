// Only the workspace changes size. The document always keeps its print width.
export function splitLayout(width, ratio = .54) {
  const gap = 14, available = Math.max(0, width - gap);
  const minLeft = Math.min(260, available / 2);
  const maxLeft = Math.max(minLeft, available - Math.min(350, available / 2));
  const fraction = Number.isFinite(ratio) ? ratio : .54;
  const left = Math.max(minLeft, Math.min(maxLeft, available * fraction));
  return {left, right: available - left, ratio: available ? left / available : .5, gap};
}

// Keep each question intact; an oversized question receives its own tall page.
// It must never be silently cropped or reduced to a smaller font.
export function paginateQuestions(items, {height, columns = 2, gap = 0}) {
  const pages = [];
  let page, column, used;
  function nextPage() {
    page = {columns: Array.from({length: columns}, () => []), oversized: false};
    pages.push(page); column = 0; used = 0;
  }
  for (const item of items) {
    if (!page) nextPage();
    if (item.height > height) {
      if (page.columns.some(c => c.length)) nextPage();
      page.columns[0].push(item.id); page.oversized = true; page = null;
      continue;
    }
    const needed = item.height + (used ? gap : 0);
    if (used + needed > height) {
      if (column + 1 >= columns) nextPage();
      else {column++; used = 0;}
    }
    page.columns[column].push(item.id);
    used += item.height + (used ? gap : 0);
  }
  return pages;
}

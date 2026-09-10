export const GRID_SIZE = 4;
export const GRID_ASSET_COUNT = GRID_SIZE * GRID_SIZE;

function cellBounds(index, length) {
  return [Math.floor(index * length / GRID_SIZE), Math.floor((index + 1) * length / GRID_SIZE)];
}

function cellMap(length) {
  const cells = new Uint8Array(length);
  for (let index = 0; index < GRID_SIZE; index++) {
    const [start, end] = cellBounds(index, length);
    cells.fill(index, start, end);
  }
  return cells;
}

export function gridAssignments(source, background) {
  const columns = cellMap(source.width), rows = cellMap(source.height);
  const parents = Array.from({ length: GRID_ASSET_COUNT }, (_, index) => index);
  const occupied = new Uint8Array(GRID_ASSET_COUNT);
  const owners = new Uint32Array(source.width * source.height);
  let boundaryForeground = false;
  const root = value => {
    while (parents[value] !== value) {
      parents[value] = parents[parents[value]];
      value = parents[value];
    }
    return value;
  };
  const join = (a, b) => {
    const left = root(a), right = root(b);
    if (left !== right) parents[Math.max(left, right)] = Math.min(left, right);
  };
  const cell = (x, y) => rows[y] * GRID_SIZE + columns[x];

  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const pixel = y * source.width + x;
    if (background[pixel]) continue;
    const column = columns[x], row = rows[y], index = row * GRID_SIZE + column;
    const [left, right] = cellBounds(column, source.width), [top, bottom] = cellBounds(row, source.height);
    const gutter = Math.min(3, Math.floor(Math.min(right - left, bottom - top) / 3));
    occupied[index] = 1;
    if (x - left < gutter || right - x <= gutter || y - top < gutter || bottom - y <= gutter) boundaryForeground = true;
    if (x + 1 < source.width && !background[pixel + 1] && cell(x + 1, y) !== index) join(index, cell(x + 1, y));
    if (y + 1 < source.height && !background[pixel + source.width] && cell(x, y + 1) !== index) join(index, cell(x, y + 1));
  }

  const labels = new Uint32Array(GRID_ASSET_COUNT);
  let groupCount = 0;
  for (let index = 0; index < GRID_ASSET_COUNT; index++) {
    if (!occupied[index]) continue;
    const parent = root(index);
    if (!labels[parent]) labels[parent] = ++groupCount;
    labels[index] = labels[parent];
  }
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const pixel = y * source.width + x;
    if (!background[pixel]) owners[pixel] = labels[root(cell(x, y))];
  }
  return { owners, groupCount, boundaryForeground };
}

function projectionBands(counts, minimumGap) {
  const bands = [];
  let start = -1, lastForeground = -1, gapStart = -1;
  for (let position = 0; position < counts.length; position++) {
    if (counts[position] > 0) {
      if (start < 0) start = position;
      if (gapStart >= 0 && position - gapStart >= minimumGap) { bands.push([start, gapStart]); start = position; }
      lastForeground = position;
      gapStart = -1;
    } else if (start >= 0 && gapStart < 0) gapStart = position;
  }
  if (start >= 0) bands.push([start, lastForeground + 1]);
  return bands;
}

export function whitespaceAssignments(source, background) {
  const rowCounts = new Uint32Array(source.height);
  const owners = new Uint32Array(source.width * source.height);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (!background[y * source.width + x]) rowCounts[y]++;
  const rowGap = Math.max(3, Math.round(source.height * 0.015));
  const columnGap = Math.max(3, Math.round(source.width * 0.015));
  let groupCount = 0;
  for (const [top, bottom] of projectionBands(rowCounts, rowGap)) {
    const columnCounts = new Uint32Array(source.width);
    for (let y = top; y < bottom; y++) for (let x = 0; x < source.width; x++) if (!background[y * source.width + x]) columnCounts[x]++;
    for (const [left, right] of projectionBands(columnCounts, columnGap)) {
      const owner = ++groupCount;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const pixel = y * source.width + x;
        if (!background[pixel]) owners[pixel] = owner;
      }
    }
  }
  return { owners, groupCount };
}

function assignmentBounds(source, assignment) {
  const bounds = Array.from({ length: assignment.groupCount }, (_, index) => ({
    owner: index + 1, left: source.width, top: source.height, right: 0, bottom: 0,
  }));
  for (let pixel = 0; pixel < assignment.owners.length; pixel++) {
    const owner = assignment.owners[pixel];
    if (!owner) continue;
    const item = bounds[owner - 1], x = pixel % source.width, y = Math.floor(pixel / source.width);
    item.left = Math.min(item.left, x); item.top = Math.min(item.top, y);
    item.right = Math.max(item.right, x + 1); item.bottom = Math.max(item.bottom, y + 1);
  }
  return bounds;
}

export function mergeAssignments(source, assignment, includeNearby) {
  if (assignment.groupCount < 2) return { ...assignment, mergeCount: 0 };
  const bounds = assignmentBounds(source, assignment);
  const parents = Array.from({ length: assignment.groupCount + 1 }, (_, index) => index);
  const root = value => {
    while (parents[value] !== value) {
      parents[value] = parents[parents[value]];
      value = parents[value];
    }
    return value;
  };
  const join = (a, b) => {
    const left = root(a), right = root(b);
    if (left !== right) parents[Math.max(left, right)] = Math.min(left, right);
  };
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const gap = (a0, a1, b0, b1) => a1 <= b0 ? b0 - a1 : b1 <= a0 ? a0 - b1 : null;
  const nearbyX = Math.max(4, Math.round(source.width * 0.01));
  const nearbyY = Math.max(4, Math.round(source.height * 0.01));

  for (let index = 0; index < bounds.length; index++) for (let other = 0; other < index; other++) {
    const a = bounds[index], b = bounds[other];
    const overlapX = overlap(a.left, a.right, b.left, b.right), overlapY = overlap(a.top, a.bottom, b.top, b.bottom);
    const gapX = gap(a.left, a.right, b.left, b.right), gapY = gap(a.top, a.bottom, b.top, b.bottom);
    const width = Math.min(a.right - a.left, b.right - b.left), height = Math.min(a.bottom - a.top, b.bottom - b.top);
    const overlappingBounds = overlapX > 0 && overlapY > 0;
    const sideBySideParts = includeNearby && gapX !== null && gapX <= nearbyX && overlapY >= height * 0.6;
    const stackedParts = includeNearby && gapY !== null && gapY <= nearbyY && overlapX >= width * 0.6;
    if (overlappingBounds || sideBySideParts || stackedParts) join(a.owner, b.owner);
  }

  const labels = new Map();
  let groupCount = 0;
  for (let owner = 1; owner <= assignment.groupCount; owner++) {
    const parent = root(owner);
    if (!labels.has(parent)) labels.set(parent, ++groupCount);
  }
  for (let pixel = 0; pixel < assignment.owners.length; pixel++) {
    const owner = assignment.owners[pixel];
    if (owner) assignment.owners[pixel] = labels.get(root(owner));
  }
  return { owners: assignment.owners, groupCount, mergeCount: assignment.groupCount - groupCount };
}

export function summarizeAssignments(source, background, assignment) {
  const items = assignmentBounds(source, assignment);
  let foregroundPixelCount = 0, assignedForegroundPixelCount = 0;
  for (let pixel = 0; pixel < background.length; pixel++) {
    if (background[pixel]) continue;
    foregroundPixelCount++;
    const owner = assignment.owners[pixel];
    if (!owner || owner > items.length) continue;
    items[owner - 1].foregroundPixelCount = (items[owner - 1].foregroundPixelCount || 0) + 1;
    assignedForegroundPixelCount++;
  }
  return {
    items: items.map(item => {
      const x = Math.max(0, item.left - 1), y = Math.max(0, item.top - 1);
      return { owner: item.owner, x, y, width: Math.min(source.width, item.right + 1) - x, height: Math.min(source.height, item.bottom + 1) - y,
        foregroundPixelCount: item.foregroundPixelCount || 0 };
    }),
    foregroundPixelCount,
    assignedForegroundPixelCount,
    unassignedForegroundPixelCount: foregroundPixelCount - assignedForegroundPixelCount,
  };
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const rounded = (value) => Math.round(value * 1000) / 1000;

function inkMask({ data, width, height }) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const luminance = (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000;
    mask[index] = data[offset + 3] > 24 && luminance < 205 ? 1 : 0;
  }
  return mask;
}

function paddedBox(bounds, width, height, padding = 0.025) {
  const padX = Math.max(2, Math.round(width * padding));
  const padY = Math.max(2, Math.round(height * padding));
  const left = clamp(bounds.left - padX, 0, width - 1);
  const top = clamp(bounds.top - padY, 0, height - 1);
  const right = clamp(bounds.right + padX, left + 1, width);
  const bottom = clamp(bounds.bottom + padY, top + 1, height);
  return { x: rounded(left / width), y: rounded(top / height),
    w: rounded((right - left) / width), h: rounded((bottom - top) / height) };
}

function occupiedBounds(mask, width, height) {
  const bounds = { left: width, top: height, right: 0, bottom: 0, count: 0 };
  mask.forEach((ink, index) => {
    if (!ink) return;
    const x = index % width, y = Math.floor(index / width);
    bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x + 1); bounds.bottom = Math.max(bounds.bottom, y + 1);
    bounds.count += 1;
  });
  return bounds.count ? bounds : null;
}

function coarseComponents(mask, width, height) {
  const cell = Math.max(2, Math.ceil(Math.max(width, height) / 96));
  const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const occupied = new Uint8Array(columns * rows);
  mask.forEach((ink, index) => {
    if (!ink) return;
    const x = index % width, y = Math.floor(index / width);
    occupied[Math.floor(y / cell) * columns + Math.floor(x / cell)] = 1;
  });
  const grown = occupied.slice();
  occupied.forEach((ink, index) => {
    if (!ink) return;
    const x = index % columns, y = Math.floor(index / columns);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) grown[ny * columns + nx] = 1;
    }
  });
  const seen = new Uint8Array(grown.length), components = [];
  grown.forEach((value, start) => {
    if (!value || seen[start]) return;
    const queue = [start], bounds = { left: columns, top: rows, right: 0, bottom: 0, cells: 0 };
    seen[start] = 1;
    while (queue.length) {
      const index = queue.pop(), x = index % columns, y = Math.floor(index / columns);
      bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x + 1); bounds.bottom = Math.max(bounds.bottom, y + 1); bounds.cells += 1;
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy, next = ny * columns + nx;
        if (nx >= 0 && nx < columns && ny >= 0 && ny < rows && grown[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      });
    }
    components.push({ left: bounds.left * cell, top: bounds.top * cell,
      right: Math.min(width, bounds.right * cell), bottom: Math.min(height, bounds.bottom * cell), cells: bounds.cells });
  });
  return components;
}

export function suggestDiagramCandidates(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height || data.length < width * height * 4) return [];
  const mask = inkMask(imageData);
  return coarseComponents(mask, width, height)
    .filter((box) => {
      const boxWidth = (box.right - box.left) / width;
      const boxHeight = (box.bottom - box.top) / height;
      const area = boxWidth * boxHeight;
      return boxWidth >= 0.12 && boxHeight >= 0.08 && area <= 0.8;
    })
    .sort((left, right) => left.top - right.top || left.left - right.left)
    .map((bounds) => paddedBox(bounds, width, height, 0.015));
}

export function suggestPageRegions(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height || data.length < width * height * 4) return [];
  const mask = inkMask(imageData), question = occupiedBounds(mask, width, height);
  if (!question || question.count < Math.max(12, width * height * 0.0005)) return [];
  const regions = [{ kind: "question", label: "문항 전체", box: paddedBox(question, width, height) }];
  const figure = suggestDiagramCandidates(imageData)
    .sort((left, right) => (right.w * right.h) - (left.w * left.h))[0];
  if (figure) regions.push({ kind: "figure", label: "도판 영역", box: figure });
  return regions;
}

export function imageDataFromElement(image) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

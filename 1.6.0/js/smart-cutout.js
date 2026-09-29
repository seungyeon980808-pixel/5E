/* ===== SMART CUTOUT (lasso-guided local background removal) ===== */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rasterizePolygon(width, height, points) {
  const inside = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const scanY = y + 0.5;
    const intersections = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > scanY) === (b.y > scanY)) continue;
      intersections.push(a.x + ((scanY - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const start = clamp(Math.ceil(intersections[i] - 0.5), 0, width);
      const end = clamp(Math.ceil(intersections[i + 1] - 0.5), 0, width);
      inside.fill(1, y * width + start, y * width + end);
    }
  }
  return inside;
}

function colorDistance(data, pixel, color) {
  const i = pixel * 4;
  const dr = data[i] - color[0];
  const dg = data[i + 1] - color[1];
  const db = data[i + 2] - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function quantizedKey(data, pixel) {
  const i = pixel * 4;
  return ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
}

function makePalette(data, boundary) {
  const bins = new Map();
  for (const pixel of boundary) {
    const i = pixel * 4;
    if (data[i + 3] === 0) continue;
    const key = quantizedKey(data, pixel);
    let bin = bins.get(key);
    if (!bin) {
      bin = { key, count: 0, r: 0, g: 0, b: 0 };
      bins.set(key, bin);
    }
    bin.count += 1;
    bin.r += data[i]; bin.g += data[i + 1]; bin.b += data[i + 2];
  }
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count);
  if (!ranked.length) return [];
  const target = boundary.length * 0.72;
  const palette = [];
  let covered = 0;
  for (const bin of ranked) {
    palette.push([bin.r / bin.count, bin.g / bin.count, bin.b / bin.count]);
    covered += bin.count;
    if (palette.length >= 4 || covered >= target) break;
  }
  return palette;
}

function nearestPaletteDistance(data, pixel, palette) {
  let best = Infinity;
  for (const color of palette) best = Math.min(best, colorDistance(data, pixel, color));
  return best;
}

/**
 * Keeps only the lasso interior, then removes boundary-connected pixels whose
 * color resembles the dominant colors sampled along the lasso. This makes the
 * lasso a background hint instead of treating it as the final object outline.
 */
export function smartCutoutRgba(source, width, height, polygon, sensitivity = 50) {
  if (!source || source.length < width * height * 4) throw new Error("Invalid RGBA buffer");
  if (!(width > 0) || !(height > 0) || !Array.isArray(polygon) || polygon.length < 3) {
    throw new Error("Smart cutout requires a closed selection");
  }

  const points = polygon.map((point) => ({
    x: clamp(Number(point.x) * width, 0, width),
    y: clamp(Number(point.y) * height, 0, height),
  }));
  const count = width * height;
  const inside = rasterizePolygon(width, height, points);
  const boundary = [];
  const output = new Uint8ClampedArray(source);

  for (let pixel = 0; pixel < count; pixel += 1) {
    if (!inside[pixel]) output[pixel * 4 + 3] = 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!inside[pixel]) continue;
      if (x === 0 || y === 0 || x + 1 === width || y + 1 === height ||
          !inside[pixel - 1] || !inside[pixel + 1] ||
          !inside[pixel - width] || !inside[pixel + width]) boundary.push(pixel);
    }
  }

  const palette = makePalette(source, boundary);
  if (!palette.length) return { data: output, bbox: alphaBounds(output, width, height) };

  const amount = clamp(Number(sensitivity) || 0, 0, 100) / 100;
  const paletteTolerance = 16 + amount * 126;
  const localTolerance = 12 + amount * 72;
  const seedTolerance = Math.max(12, paletteTolerance * 0.72);
  const removed = new Uint8Array(count);
  const queued = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;

  const enqueue = (pixel) => {
    if (pixel < 0 || pixel >= count || queued[pixel] || !inside[pixel]) return;
    queued[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (const pixel of boundary) {
    if (source[pixel * 4 + 3] === 0 || nearestPaletteDistance(source, pixel, palette) <= seedTolerance) {
      enqueue(pixel);
    }
  }

  while (head < tail) {
    const pixel = queue[head++];
    if (removed[pixel]) continue;
    removed[pixel] = 1;
    const x = pixel % width;
    const neighbors = [];
    if (x > 0) neighbors.push(pixel - 1);
    if (x + 1 < width) neighbors.push(pixel + 1);
    if (pixel >= width) neighbors.push(pixel - width);
    if (pixel + width < count) neighbors.push(pixel + width);
    for (const next of neighbors) {
      if (!inside[next] || queued[next]) continue;
      const alpha = source[next * 4 + 3];
      const paletteDistance = nearestPaletteDistance(source, next, palette);
      const localDistance = colorDistance(source, next, [
        source[pixel * 4], source[pixel * 4 + 1], source[pixel * 4 + 2],
      ]);
      if (alpha === 0 || (paletteDistance <= paletteTolerance && localDistance <= localTolerance)) enqueue(next);
    }
  }

  for (let pixel = 0; pixel < count; pixel += 1) {
    if (removed[pixel]) output[pixel * 4 + 3] = 0;
  }

  // Convert color-contaminated edge pixels into partial alpha to avoid a pale halo.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const ai = pixel * 4 + 3;
      if (!inside[pixel] || output[ai] === 0) continue;
      const touchesRemoved = (x > 0 && removed[pixel - 1]) ||
        (x + 1 < width && removed[pixel + 1]) ||
        (y > 0 && removed[pixel - width]) || (y + 1 < height && removed[pixel + width]);
      if (!touchesRemoved) continue;
      const distance = nearestPaletteDistance(source, pixel, palette);
      const coverage = clamp((distance - paletteTolerance * 0.72) / Math.max(1, paletteTolerance * 0.45), 0, 1);
      output[ai] = Math.round(output[ai] * coverage);
    }
  }

  return { data: output, bbox: alphaBounds(output, width, height) };
}

export function alphaBounds(rgba, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

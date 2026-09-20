export const STRUCTURE_LOCK_VERSION = "structure-lock-v1";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("원본 이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

function components(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const found = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0, touchesEdge = false;
    const pixels = [];
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const pixel = queue[head++];
      pixels.push(pixel);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x + 1 === width || y + 1 === height) touchesEdge = true;
      const neighbors = [x ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1, y ? pixel - width : -1, y + 1 < height ? pixel + width : -1];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    found.push({ pixels, area: pixels.length, minX, minY, maxX, maxY, touchesEdge });
  }
  return found.sort((a, b) => b.area - a.area);
}

function dilate(mask, width, height, passes = 2) {
  let current = mask;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let pixel = 0; pixel < current.length; pixel += 1) {
      if (!current[pixel]) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x) next[pixel - 1] = 1;
      if (x + 1 < width) next[pixel + 1] = 1;
      if (y) next[pixel - width] = 1;
      if (y + 1 < height) next[pixel + width] = 1;
    }
    current = next;
  }
  return current;
}

function blur(values, width, height, radius = 2) {
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += values[y * width + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / (radius * 2 + 1);
      sum -= values[y * width + Math.max(0, x - radius)];
      sum += values[y * width + Math.min(width - 1, x + radius + 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / (radius * 2 + 1);
      sum -= horizontal[Math.max(0, y - radius) * width + x];
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x];
    }
  }
  return output;
}

export async function createStructureLockedLineart(src, { maxSide = 1600 } = {}) {
  const image = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("형태 잠금용 캔버스를 만들지 못했습니다.");
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const rgba = imageData.data;
  const count = width * height;
  const luminance = new Float32Array(count);
  const red = new Uint8Array(count);
  const green = new Uint8Array(count);
  const blue = new Uint8Array(count);
  const chroma = new Uint8Array(count);
  let chromaCount = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4;
    const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
    red[pixel] = r; green[pixel] = g; blue[pixel] = b;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    luminance[pixel] = r * .2126 + g * .7152 + b * .0722;
    // Pale textbook panels and card backgrounds are layout, not the subject.
    // Seed from materially coloured regions only; nearby black outlines are
    // recovered after the semantic colour mask is built.
    if (hi - lo >= 24 && luminance[pixel] < 225 && rgba[offset + 3] > 16) {
      chroma[pixel] = 1;
      chromaCount += 1;
    }
  }

  let subject = new Uint8Array(count);
  if (chromaCount / count >= .008) {
    const minimum = Math.max(18, Math.round(count * .000025));
    let keptArea = 0;
    const colorComponents = components(chroma, width, height);
    const largestArea = colorComponents[0]?.area || 1;
    for (const component of colorComponents) {
      if (component.area < minimum) continue;
      const boxArea = (component.maxX - component.minX + 1) * (component.maxY - component.minY + 1);
      const fill = component.area / Math.max(1, boxArea);
      let sumLuma = 0, sumR = 0, sumG = 0, sumB = 0;
      for (const pixel of component.pixels) {
        sumLuma += luminance[pixel]; sumR += red[pixel]; sumG += green[pixel]; sumB += blue[pixel];
      }
      const meanLuma = sumLuma / component.area;
      const meanR = sumR / component.area, meanG = sumG / component.area, meanB = sumB / component.area;
      const backgroundField = component.touchesEdge && component.area > count * .025 && meanLuma > 205;
      const small = component.area < largestArea * .035;
      const redMarkup = small && meanR > meanG * 1.28 && meanR > meanB * 1.28;
      const componentWidth = component.maxX - component.minX + 1;
      const componentHeight = component.maxY - component.minY + 1;
      const elongatedBlueMarkup = small && meanB > meanR * 1.2
        && componentWidth / Math.max(1, componentHeight) > 1.7 && fill < .65;
      const thinNoise = fill < .14 && component.area < count * .002;
      if (backgroundField || redMarkup || elongatedBlueMarkup || thinNoise) continue;
      for (const pixel of component.pixels) subject[pixel] = 1;
      keptArea += component.area;
    }
    if (keptArea >= count * .002) {
      subject = dilate(subject, width, height, Math.max(2, Math.round(Math.min(width, height) / 180)));
    }
  }
  if (!subject.some(Boolean)) {
    const dark = new Uint8Array(count);
    for (let pixel = 0; pixel < count; pixel += 1) dark[pixel] = luminance[pixel] < 225 ? 1 : 0;
    const joined = dilate(dark, width, height, Math.max(2, Math.round(Math.min(width, height) / 250)));
    const darkComponents = components(joined, width, height);
    const candidates = darkComponents.filter((component) => !component.touchesEdge && component.area >= count * .002);
    const selected = candidates[0] || darkComponents[0];
    if (selected) {
      for (const pixel of selected.pixels) subject[pixel] = 1;
      // Neutral specimens are often textured islands separated by pale pixels.
      // Fill the interior span of the selected specimen before tracing so the
      // texture is not mistaken for hundreds of independent objects.
      for (let y = selected.minY; y <= selected.maxY; y += 1) {
        let first = width, last = -1;
        for (let x = selected.minX; x <= selected.maxX; x += 1) {
          if (!subject[y * width + x]) continue;
          first = Math.min(first, x); last = Math.max(last, x);
        }
        if (last >= first) for (let x = first; x <= last; x += 1) subject[y * width + x] = 1;
      }
    }
    subject = dilate(subject, width, height, 2);
  }

  const smoothed = blur(luminance, width, height, 2);
  const edges = new Uint8Array(count);
  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < width; x += 1) {
      const pixel = y * width + x;
      if (!subject[pixel]) continue;
      const boundary = !subject[pixel - 1] || !subject[pixel + 1] || !subject[pixel - width] || !subject[pixel + width];
      const gx = smoothed[pixel + 1] - smoothed[pixel - 1];
      const gy = smoothed[pixel + width] - smoothed[pixel - width];
      if (boundary || Math.hypot(gx, gy) >= 26) edges[pixel] = 1;
    }
  }
  const ink = dilate(edges, width, height, Math.max(1, Math.round(Math.min(width, height) / 700)));
  const output = context.createImageData(width, height);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4;
    output.data[offset] = 0;
    output.data[offset + 1] = 0;
    output.data[offset + 2] = 0;
    output.data[offset + 3] = ink[pixel] ? 255 : 0;
  }
  context.clearRect(0, 0, width, height);
  context.putImageData(output, 0, 0);
  return canvas.toDataURL("image/png");
}

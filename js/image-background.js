/* AI 선화의 흰색 래스터 배경을 투명 알파로 바꾼다.
 * 순백/근백색의 무채색 픽셀만 제거하므로 검은 선과 의미 있는 회색·색상은 보존한다. */

export const IMAGE_BACKGROUND_VERSION = "image-background-v3-exam-palette";

export const EXAM_GRAY_PALETTE = Object.freeze([0, 176, 255]);

export function quantizeExamLineart(rgba, {
  palette = EXAM_GRAY_PALETTE,
  whiteCutoff = 248,
} = {}) {
  if (!rgba || typeof rgba.length !== "number") return rgba;
  const tones = Array.from(new Set((palette || EXAM_GRAY_PALETTE).map(Number)))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255)
    .sort((a, b) => a - b);
  if (!tones.includes(0) || !tones.includes(255)) throw new Error("평가원 팔레트에는 검정과 흰색이 필요합니다.");
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const luminance = Math.round(rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722);
    const target = luminance >= whiteCutoff
      ? 255
      : tones.reduce((best, tone) => Math.abs(tone - luminance) < Math.abs(best - luminance) ? tone : best, tones[0]);
    rgba[i] = target;
    rgba[i + 1] = target;
    rgba[i + 2] = target;
  }
  return rgba;
}

export function makeNearWhiteTransparent(rgba, { threshold = 235, neutralTolerance = 12 } = {}) {
  if (!rgba || typeof rgba.length !== "number") return rgba;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (lo < threshold || hi - lo > neutralTolerance || a === 0) continue;

    // 흰 바탕 위 검은 선의 안티앨리어싱 픽셀을 검정+부분 알파로 환산한다.
    const luminance = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const coverage = Math.max(0, Math.min(1, (255 - luminance) / 255));
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = Math.round(a * coverage);
  }
  return rgba;
}

/* 생성기가 투명 배경을 표현하려고 이미지 픽셀 자체에 넣은 흰색/연회색 체크무늬를 제거한다.
 * 가장자리에서 이어지는 밝은 무채색 영역만 flood-fill하므로, 검은 외곽선 안에 갇힌 장치의
 * 회색 채움은 보존된다. 실제 투명도 표시 여부는 5E 미리보기에서 흰 종이로 합성해 결정한다. */
export function removeConnectedLightBackground(rgba, width, height, {
  threshold = 205,
  neutralTolerance = 20,
} = {}) {
  if (!rgba || !(width > 0) || !(height > 0) || rgba.length < width * height * 4) return rgba;
  const count = width * height;
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const qualifies = (pixel) => {
    const i = pixel * 4;
    if (rgba[i + 3] === 0) return true;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    return Math.min(r, g, b) >= threshold && Math.max(r, g, b) - Math.min(r, g, b) <= neutralTolerance;
  };
  const enqueue = (pixel) => {
    if (pixel < 0 || pixel >= count || seen[pixel] || !qualifies(pixel)) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y + 1 < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (!seen[pixel]) continue;
    const i = pixel * 4;
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 0;
  }
  return rgba;
}

/* 생성 모델이 실제 투명도 대신 이미지 안쪽에 그려 넣은 회백색 체크무늬를 제거한다.
 * 밝고 무채색인 연결 영역 가운데 서로 떨어진 두 밝기값이 반복되는 영역만 대상으로 하므로,
 * 단색 회색 장치 채움이나 선의 안티앨리어싱은 보존한다. */
export function removeEmbeddedCheckerboard(rgba, width, height, {
  threshold = 205,
  neutralTolerance = 18,
  minimumPixels = 24,
} = {}) {
  if (!rgba || !(width > 0) || !(height > 0) || rgba.length < width * height * 4) return rgba;
  const count = width * height;
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  const qualifies = (pixel) => {
    const i = pixel * 4;
    if (rgba[i + 3] === 0) return false;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    return Math.min(r, g, b) >= threshold && Math.max(r, g, b) - Math.min(r, g, b) <= neutralTolerance;
  };
  for (let start = 0; start < count; start += 1) {
    if (seen[start] || !qualifies(start)) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const component = [];
    const histogram = new Uint32Array(64);
    while (head < tail) {
      const pixel = queue[head++];
      component.push(pixel);
      const i = pixel * 4;
      const luminance = Math.round(rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722);
      histogram[Math.min(63, Math.floor(luminance / 4))] += 1;
      const x = pixel % width;
      const neighbors = [x > 0 ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1, pixel >= width ? pixel - width : -1, pixel + width < count ? pixel + width : -1];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !qualifies(next)) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (component.length < minimumPixels) continue;
    const peaks = Array.from(histogram, (amount, bin) => ({ amount, bin }))
      .filter((entry) => entry.amount)
      .sort((a, b) => b.amount - a.amount);
    const first = peaks[0], second = peaks.find((entry) => Math.abs(entry.bin - first.bin) >= 2);
    if (!second) continue;
    const firstShare = first.amount / component.length;
    const secondShare = second.amount / component.length;
    if (firstShare < .12 || secondShare < .12 || firstShare + secondShare < .62) continue;
    for (const pixel of component) {
      const i = pixel * 4;
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    }
  }
  return rgba;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("생성 이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

export async function transparentizeGeneratedImage(src, { examPalette = true } = {}) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 1;
  canvas.height = img.naturalHeight || img.height || 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("이미지 투명화용 캔버스를 만들지 못했습니다.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  removeEmbeddedCheckerboard(pixels.data, canvas.width, canvas.height);
  removeConnectedLightBackground(pixels.data, canvas.width, canvas.height);
  if (examPalette) quantizeExamLineart(pixels.data);
  makeNearWhiteTransparent(pixels.data);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

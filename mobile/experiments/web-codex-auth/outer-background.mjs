import { thickenDarkLines as thickenSharedDarkLines } from '../../js/image-line-thickness.js';

const MAX_PIXELS = 16_777_216;
const MAX_SIDE = 8192;

function checkDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE
    || width * height > MAX_PIXELS) {
    throw new RangeError('이미지가 너무 크거나 크기가 올바르지 않습니다.');
  }
}

export function removeOuterWhite(rgba, width, height) {
  checkDimensions(width, height);
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new TypeError('올바른 RGBA 이미지가 필요합니다.');
  }
  const output = new Uint8ClampedArray(rgba);
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (pixel) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const offset = pixel * 4;
    const low = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    const high = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    // A strict neutral-white threshold preserves gray strokes and colored detail.
    if (rgba[offset + 3] !== 0 && (low < 250 || high - low > 2)) return;
    output[offset + 3] = 0;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel + width < width * height) visit(pixel + width);
  }
  return output;
}

export function removeAllWhite(rgba, width, height) {
  checkDimensions(width, height);
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new TypeError('올바른 RGBA 이미지가 필요합니다.');
  }
  const output = new Uint8ClampedArray(rgba);
  for (let offset = 0; offset < output.length; offset += 4) {
    const low = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    const high = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    if (low >= 250 && high - low <= 2) output[offset + 3] = 0;
  }
  return output;
}

export function thickenDarkLines(rgba, width, height, radius = 0) {
  checkDimensions(width, height);
  if (![0, 1, 2].includes(radius)) throw new TypeError('선 굵기 옵션이 올바르지 않습니다.');
  return thickenSharedDarkLines(rgba, { width, height, radius });
}

export async function transparentOuterPng(dataURL, mode = 'outer', radius = 0) {
  if (!['outer', 'all', 'white'].includes(mode)) throw new TypeError('배경 처리 옵션이 올바르지 않습니다.');
  if (![0, 1, 2].includes(radius)) throw new TypeError('선 굵기 옵션이 올바르지 않습니다.');
  if (typeof dataURL !== 'string' || !/^data:image\/png;base64,/i.test(dataURL)
    || dataURL.length > 48 * 1024 * 1024) {
    throw new TypeError('PNG 이미지가 필요합니다.');
  }
  if (mode === 'white' && radius === 0) return dataURL;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('PNG 이미지를 읽지 못했습니다.'));
    image.src = dataURL;
  });
  checkDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('이미지 처리를 사용할 수 없습니다.');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const thickened = thickenDarkLines(pixels.data, canvas.width, canvas.height, radius);
  pixels.data.set(mode === 'white' ? thickened
    : (mode === 'all' ? removeAllWhite : removeOuterWhite)(thickened, canvas.width, canvas.height));
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

import { decodeScopedPng, encodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';
import { brushPixelMask, rectanglePixelMask } from './image-erase-mask.js?v=1.7.0-four-session-integration';
import { polygonPixelMask } from './polygon-mask.js?v=1.7.0-four-session-integration';
const abort = signal => { if (signal?.aborted) throw new DOMException('지우기 취소 · 이전 버전 유지', 'AbortError'); };

async function eraseMaskedImage(dataUrl, makeMask, { signal, background = 'transparent', minimum = 0 } = {}) {
  abort(signal);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new TypeError('PNG 수정본에서 지우개를 사용할 수 있습니다.');
  if (!['white', 'transparent'].includes(background)) throw new TypeError('지운 자리의 배경을 선택하세요.');
  const encoded = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const image = await decodeScopedPng(Uint8Array.from(encoded, c => c.charCodeAt(0)));
  abort(signal);
  const mask = makeMask(image.width, image.height);
  const pixels = new Uint8Array(image.data);
  let changedPixels = 0, maskedPixels = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    maskedPixels++;
    const offset = i * 4;
    const fill = background === 'white' ? 255 : 0;
    if (pixels[offset] !== fill || pixels[offset+1] !== fill || pixels[offset+2] !== fill || pixels[offset+3] !== fill) changedPixels++;
    pixels.fill(fill, offset, offset + 4);
  }
  if (maskedPixels < minimum) throw new RangeError('지울 영역을 조금 더 크게 둘러싸 주세요.');
  if (!changedPixels) return null;
  // Retain color metadata and every RGBA byte outside the binary mask. A canvas
  // re-encode would premultiply/rewrite RGB in transparent, unselected pixels.
  const png = await encodeScopedPng({ width: image.width, height: image.height, data: pixels }, { metadata: image.metadata });
  abort(signal);
  const chunks = [];
  for (let i = 0; i < png.length; i += 8192) chunks.push(String.fromCharCode(...png.subarray(i, i + 8192)));
  return { data: 'data:image/png;base64,' + btoa(chunks.join('')), width: image.width, height: image.height,
    changedPixels, maskedPixels, outsideRgbaChanged: 0, background };
}

export async function eraseImagePolygon(dataUrl, polygon, { signal } = {}) {
  const result = await eraseMaskedImage(dataUrl, (w, h) => polygonPixelMask(w, h, polygon), { signal, minimum: 4 });
  return result && { ...result, polygon: polygon.map(p => ({ x: p.x, y: p.y })) };
}

export async function eraseImageRegion(dataUrl, { mode, points, diameter, background = 'transparent' }, { signal } = {}) {
  if (!['brush', 'rect'].includes(mode)) throw new TypeError('지우개 방식을 선택하세요.');
  const result = await eraseMaskedImage(dataUrl, (w, h) => mode === 'brush'
    ? brushPixelMask(w, h, points, diameter) : rectanglePixelMask(w, h, points), { signal, background });
  return result && { ...result, mode, points: points.map(p => ({ x:p.x, y:p.y })), ...(mode === 'brush' ? { diameter } : {}) };
}


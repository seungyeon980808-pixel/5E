import { decodeScopedPng, encodeScopedPng, applyScopedPngEdit } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';

// Padding and integer cropping only: never resize a source or relocate a target.
export async function prepareScopedEditContext(sourcePng, rectangles, { contextMargin = null } = {}) {
  const source = await decodeScopedPng(sourcePng);
  const width = 1536, height = 1024;
  const originalRectangles = rectangles.map(r => ({ ...r }));
  const left = Math.min(...rectangles.map(r => r.x0)), right = Math.max(...rectangles.map(r => r.x1));
  const top = Math.min(...rectangles.map(r => r.y0)), bottom = Math.max(...rectangles.map(r => r.y1));
  if (!rectangles.length || left < 0 || top < 0 || right > source.width || bottom > source.height
      || rectangles.some(r => ![r.x0, r.y0, r.x1, r.y1].every(Number.isInteger) || r.x0 >= r.x1 || r.y0 >= r.y1)) {
    throw new Error('수정 박스의 원본 픽셀 좌표가 유효하지 않습니다.');
  }
  if (right - left > width || bottom - top > height) {
    throw new Error('선택 박스들이 무확대 입력 한 장에 함께 들어가지 않습니다. 박스를 나누어 수정하세요.');
  }
  if (contextMargin !== null && (!Number.isSafeInteger(contextMargin) || contextMargin < 0)) {
    throw new Error('입력 문맥 여백은 0 이상의 정수 픽셀이어야 합니다.');
  }
  const cropWidth = Math.min(source.width, width, contextMargin === null ? width : right - left + contextMargin * 2);
  const cropHeight = Math.min(source.height, height, contextMargin === null ? height : bottom - top + contextMargin * 2);
  const cropX = Math.max(0, Math.min(source.width - cropWidth, Math.floor((left + right - cropWidth) / 2)));
  const cropY = Math.max(0, Math.min(source.height - cropHeight, Math.floor((top + bottom - cropHeight) / 2)));
  const padX = Math.floor((width - cropWidth) / 2), padY = Math.floor((height - cropHeight) / 2);
  const origin = { x: cropX - padX, y: cropY - padY };
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < cropHeight; y++) {
    const start = ((cropY + y) * source.width + cropX) * 4;
    data.set(source.data.subarray(start, start + cropWidth * 4), ((padY + y) * width + padX) * 4);
  }
  const contextRectangles = originalRectangles.map(r => ({
    x0: r.x0 - origin.x, y0: r.y0 - origin.y, x1: r.x1 - origin.x, y1: r.y1 - origin.y,
  }));
  return { source, originalRectangles, width, height, origin, rectangles: contextRectangles,
    inputPng: await encodeScopedPng({ width, height, data }, { metadata: source.metadata }) };
}

export async function restoreScopedEditContext(context, candidatePng) {
  const mask = new Uint8Array(context.width * context.height);
  for (const r of context.rectangles) for (let y = r.y0; y < r.y1; y++) {
    mask.fill(1, y * context.width + r.x0, y * context.width + r.x1);
  }
  const applied = await applyScopedPngEdit(context.inputPng, candidatePng, mask);
  const local = await decodeScopedPng(applied.png);
  const data = new Uint8Array(context.source.data);
  for (const r of context.originalRectangles) {
    for (let y = r.y0; y < r.y1; y++) {
      const from = ((y - context.origin.y) * context.width + r.x0 - context.origin.x) * 4;
      const to = (y * context.source.width + r.x0) * 4;
      data.set(local.data.subarray(from, from + (r.x1 - r.x0) * 4), to);
    }
  }
  return encodeScopedPng({ width: context.source.width, height: context.source.height, data },
    { metadata: context.source.metadata });
}

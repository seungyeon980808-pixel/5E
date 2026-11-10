// 새 기본 생성 경로(라벨 삭제·라벨 복원)의 생성 PNG를 로컬에서 무채색으로 바꾼다(AI 호출 없음).
// 모델이 옅은 색을 남기는 경우가 있어(실측: 224,577 픽셀 유채색) 캐시·맞춤·검사 전에 한 번만 적용한다.
// R=G=B=round(0.299R+0.587G+0.114B), 알파는 그대로 둔다. 흰 바탕(255,255,255)은 255로 그대로 남는다.
export const GRAYSCALE_PNG_VERSION = '1.0.0';

export function grayscaleRgbaInPlace(rgba) {
  if (!rgba || typeof rgba.length !== 'number' || rgba.length % 4 !== 0) throw new Error('RGBA 픽셀 길이가 올바르지 않습니다.');
  for (let i = 0; i < rgba.length; i += 4) {
    const y = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    rgba[i] = y; rgba[i + 1] = y; rgba[i + 2] = y;
  }
  return rgba;
}

// 브라우저 렌더러(canvas)에서만 동작한다. 디코드·인코드 실패는 호출한 쪽이 처리한다.
export async function grayscalePngDataUrl(dataUrl, { signal } = {}) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/i.test(dataUrl)) throw new Error('무채색 변환할 PNG 데이터가 없습니다.');
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!(width > 0 && height > 0)) throw new Error('PNG 크기가 올바르지 않습니다.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, width, height);
    grayscaleRgbaInPlace(frame.data);
    context.putImageData(frame, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}

// 후처리 실패는 변환 실패로 만들지 않는다(사용자 규칙: 후처리 실패 시 앞 결과로). 실패하면 원본 PNG를 그대로 돌려주고 사유를 남긴다.
export async function grayscaleGeneratedPng(dataUrl, { signal, convert = grayscalePngDataUrl, now = () => performance.now() } = {}) {
  const started = now();
  try {
    const data = await convert(dataUrl, { signal });
    return { data, applied: true, reason: null, ms: Math.round(now() - started) };
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    return { data: dataUrl, applied: false, reason: String(error?.message || error).slice(0, 200), ms: Math.round(now() - started) };
  }
}

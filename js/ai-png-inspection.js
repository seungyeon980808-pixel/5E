import { decodeScopedPng } from './ai-scoped-edit-png.js';
/** Non-mutating pixel diagnostics. These numbers are NOT semantic/KICE scores. */
export const PNG_INSPECTION_VERSION = "1.0.0";

export function inspectRgbaPixels(pixels, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width * height > 16_000_000 || !pixels || pixels.length !== width * height * 4) {
    throw new Error("픽셀 검사 크기가 올바르지 않습니다.");
  }
  let nonOpaquePixels = 0, chromaticPixels = 0, visibleColorPixels = 0;
  let whitePixels = 0, darkPixels = 0, borderPixels = 0, whiteBorderPixels = 0;
  let maxChannelDifference = 0;
  const band = Math.min(4, width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (![r, g, b, a].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
        throw new Error("픽셀 값이 올바르지 않습니다.");
      }
      if (a !== 255) nonOpaquePixels += 1;
      const difference = Math.max(r, g, b) - Math.min(r, g, b);
      if (difference > 0) chromaticPixels += 1;
      if (difference > 3) visibleColorPixels += 1;
      maxChannelDifference = Math.max(maxChannelDifference, difference);
      const white = r === 255 && g === 255 && b === 255 && a === 255;
      if (white) whitePixels += 1;
      if (Math.max(r, g, b) <= 32 && a === 255) darkPixels += 1;
      if (x < band || x >= width - band || y < band || y >= height - band) {
        borderPixels += 1;
        if (white) whiteBorderPixels += 1;
      }
    }
  }
  const pixelCount = width * height;
  return {
    version: PNG_INSPECTION_VERSION, width, height, pixelCount,
    opaque: nonOpaquePixels === 0, nonOpaquePixels,
    strictlyAchromatic: chromaticPixels === 0, chromaticPixels,
    channelDifferenceOver3Share: visibleColorPixels / pixelCount,
    maxChannelDifference, exactWhiteShare: whitePixels / pixelCount,
    darkPixelShare: darkPixels / pixelCount,
    exactWhiteBorderShare: whiteBorderPixels / borderPixels,
    limitations: "측정만 수행. 검정 선과 면, 과학적 구조, 배경 영역은 구별하지 못함.",
  };
}

export async function inspectPngDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !/^data:image\/png;base64,iVBORw0KGgo/.test(dataUrl)) {
    throw new Error("검사할 PNG 데이터가 없습니다.");
  }
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), value => value.charCodeAt(0));
  const { data, width, height } = await decodeScopedPng(bytes);
  return inspectRgbaPixels(data, width, height);
}

/** Necessary file gates, not proof of semantic correctness or background segmentation. */
export function enforcePngAcceptance(detail, candidate) {
  if (detail?.state !== 'passed') return detail;
  const p = candidate?.pixelInspection;
  let message = null;
  if (candidate?.pixelInspectionError || !p || p.opaque == null || p.strictlyAchromatic == null) message = '파일 픽셀 검사를 완료하지 못했습니다.';
  else if (p.opaque !== true) message = 'PNG에 투명 픽셀이 남아 있습니다.';
  else if (p.strictlyAchromatic !== true) message = `완전 무채색 조건 미충족: 색상 채널이 다른 픽셀 ${p.chromaticPixels ?? '확인됨'}개. 시각 검수 통과와 별개로 확인이 필요합니다.`;
  if (!message) return detail;
  const verdict = p?.opaque === false || p?.strictlyAchromatic === false ? 'fail' : 'uncertain';
  return {...detail,state:'needs-attention',report:{...detail.report,verdict,
    checks:(detail.report?.checks||[]).map(c=>c.id==='presentation'?{...c,status:verdict,detail:message}:c),
    issues:[...(detail.report?.issues||[]),{message,severity:'major'}]}};
}

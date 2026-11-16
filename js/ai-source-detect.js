// 11-11: 파일·붙여넣기·캡처로 넣은 그림의 출처(기출/교과서)를 픽셀 색으로 자동 판단한다.
// 순수 함수만 둔다(DOM·캔버스 의존 없음). 호출자가 캔버스에서 RGBA 픽셀을 읽어 넘긴다.

export const SOURCE_DETECT_MAX_SIDE = 256;
export const SOURCE_DETECT_EXAM_MAX = 0.005;   // 유채색 비율 0.5% 미만 → 기출(무채색에 가까움)
export const SOURCE_DETECT_GENERAL_MIN = 0.03; // 유채색 비율 3% 초과 → 교과서(색이 뚜렷함)

// 11-11: 한 픽셀이 「유채색」인지. 채널 차이가 40보다 크고, 거의 흰색(세 채널 모두 235 이상)은 뺀다.
export function isColoredPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min <= 40) return false;
  if (min >= 235) return false;
  return true;
}

// 11-11: 긴 변이 maxSide를 넘으면 줄여 표본을 만든다(최근접 샘플링, 투명 픽셀은 흰색으로 본다).
export function downscaleRgba(data, width, height, maxSide = SOURCE_DETECT_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * w + x) * 4;
      const alpha = data[si + 3] / 255;
      out[di] = 255 - (255 - data[si]) * alpha;
      out[di + 1] = 255 - (255 - data[si + 1]) * alpha;
      out[di + 2] = 255 - (255 - data[si + 2]) * alpha;
      out[di + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

// 11-11: 유채색 픽셀 비율(0~1). 빈 그림이면 0.
export function coloredPixelRatio(data, width, height) {
  const total = width * height;
  if (!total) return 0;
  let colored = 0;
  for (let i = 0; i < total * 4; i += 4) {
    if (isColoredPixel(data[i], data[i + 1], data[i + 2])) colored += 1;
  }
  return colored / total;
}

// 11-11: 비율로 출처를 정한다. 애매하면 'ambiguous'(사용자가 고를 때까지 기다린다).
export function sourceKindForColoredRatio(ratio) {
  if (!Number.isFinite(ratio)) return 'ambiguous';
  if (ratio < SOURCE_DETECT_EXAM_MAX) return 'exam';
  if (ratio > SOURCE_DETECT_GENERAL_MIN) return 'general';
  return 'ambiguous';
}

// 11-11: 픽셀 → 표본 축소 → 비율 → 출처. 결과에 판단 근거(ratio)를 함께 준다.
export function detectImageSourceKind(data, width, height) {
  const small = downscaleRgba(data, width, height);
  const ratio = coloredPixelRatio(small.data, small.width, small.height);
  return { kind: sourceKindForColoredRatio(ratio), ratio };
}

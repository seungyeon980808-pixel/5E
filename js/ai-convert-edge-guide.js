// 실험(11-23 변환 후속, 선택 옵션 — 기본 꺼짐): 교과서 그림 변환 「윤곽 밑그림」.
// 밤샘 실험: 교과서 그림(특히 단순한 심장 그림 T1)을 그림 AI가 원본 윤곽 대신 일반 해부도처럼 다시 구상했다(혈관 가지 늘어남·모양 바뀜).
// 지시문 한 줄(「덧붙이지 말 것」「단순화 수준 유지」)로는 못 고쳤다. 원본의 색 경계를 기계로 뽑은 선화(밑그림)를 두 번째 첨부로 주면
// 그림 AI가 관·가지·구획의 개수와 위치를 밑그림대로 따른다(문항→그림 갈래의 SVG 밑그림과 같은 원리). AI 호출 없음.

/** 색 채널(R·G·B)별 소벨 기울기의 최댓값이 문턱을 넘는 점을 검은 선으로(흰 바탕). 회색 밝기만 쓰면 빨강·파랑처럼 밝기가 같은 색 경계가 빠진다. */
export function edgeGuideRgba(rgba, width, height, { threshold = 38 } = {}) {
  const W = width, H = height, out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let best = 0;
    for (let c = 0; c < 3; c++) {
      const v = (xx, yy) => rgba[(yy * W + xx) * 4 + c];
      const gx = v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1);
      const gy = v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1);
      best = Math.max(best, Math.hypot(gx, gy) / 4);
    }
    if (best > threshold) { const i = (y * W + x) * 4; out[i] = out[i + 1] = out[i + 2] = 0; }
  }
  return out;
}

export const EDGE_GUIDE_NOTE = '두 번째 첨부는 첫 번째 원본 그림의 윤곽을 기계로 뽑은 선화(밑그림)다. 물체 윤곽·관·가지·구획 경계의 개수와 위치는 이 밑그림을 그대로 따르고(밑그림에 없는 선은 그리지 않는다), 회색 진하기는 첫 번째 원본의 색으로 정한다. 밑그림에 보이는 글자·지시선·캡션·안내 캐릭터는 [지운다] 규칙대로 지운다.';

/** 원본 data URL → 밑그림 PNG data URL. 브라우저(캔버스)가 없거나 실패하면 null(밑그림 없이 그대로 진행). */
export async function edgeGuideDataUrl(dataUrl, { signal, threshold } = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !String(dataUrl || '').startsWith('data:image/')) return null;
  try {
    const image = new Image(); image.src = dataUrl; await image.decode();
    if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
    const W = image.naturalWidth, H = image.naturalHeight;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff'; context.fillRect(0, 0, W, H); context.drawImage(image, 0, 0);
    const edges = edgeGuideRgba(context.getImageData(0, 0, W, H).data, W, H, { threshold });
    context.putImageData(new ImageData(edges, W, H), 0, 0);
    const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
    return url;
  } catch (error) { if (error?.name === 'AbortError') throw error; return null; }
}

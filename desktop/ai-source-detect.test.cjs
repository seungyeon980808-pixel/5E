const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
const assert = require('node:assert/strict');
const detect = import('../js/ai-source-detect.js');

// 11-11: 가로 w, 세로 h의 RGBA 그림을 만든다. paint(x, y)가 [r,g,b]를 돌려준다.
function makeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = paint(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return data;
}

test('11-11: 유채색 판정 기준', async () => {
  const { isColoredPixel } = await detect;
  assert.equal(isColoredPixel(0, 0, 0), false, '검은 픽셀은 무채색');
  assert.equal(isColoredPixel(128, 128, 128), false, '회색은 무채색');
  assert.equal(isColoredPixel(255, 255, 255), false, '흰색은 무채색');
  assert.equal(isColoredPixel(250, 250, 240), false, '거의 흰 색은 뺀다(min >= 235)');
  assert.equal(isColoredPixel(250, 240, 200), true, '연한 노랑은 보이는 색이라 유채색');
  assert.equal(isColoredPixel(200, 60, 60), true, '빨강 계열은 유채색');
  assert.equal(isColoredPixel(120, 150, 200), true, '파랑 계열은 유채색');
  assert.equal(isColoredPixel(100, 110, 130), false, '채널 차이 40 이하는 무채색');
});

test('11-11: 표본 축소는 긴 변을 256 이하로 맞추고 투명 픽셀을 흰색으로 본다', async () => {
  const { downscaleRgba } = await detect;
  const big = makeImage(1024, 512, () => [0, 0, 0]);
  const small = downscaleRgba(big, 1024, 512);
  assert.equal(small.width, 256);
  assert.equal(small.height, 128);
  const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
  const t = downscaleRgba(transparent, 1, 1);
  assert.deepEqual([...t.data.slice(0, 3)], [255, 255, 255]);
});

test('11-11: 흑백 그림은 기출, 색이 뚜렷한 그림은 교과서, 그 사이는 애매', async () => {
  const { detectImageSourceKind } = await detect;
  const gray = makeImage(300, 300, (x, y) => (x + y) % 2 ? [40, 40, 40] : [230, 230, 230]);
  const g = detectImageSourceKind(gray, 300, 300);
  assert.equal(g.kind, 'exam');
  assert.ok(g.ratio < 0.005);

  const colored = makeImage(300, 300, () => [220, 60, 50]);
  const c = detectImageSourceKind(colored, 300, 300);
  assert.equal(c.kind, 'general');
  assert.ok(c.ratio > 0.03);

  // 전체의 약 1%만 유채색 → 0.5%~3% 사이라 애매
  const mixed = makeImage(300, 300, (x, y) => (y < 30 && x < 30) ? [200, 40, 40] : [0, 0, 0]);
  const m = detectImageSourceKind(mixed, 300, 300);
  assert.equal(m.kind, 'ambiguous');
});

test('11-11: 비율 경계값과 빈 입력', async () => {
  const { sourceKindForColoredRatio, coloredPixelRatio } = await detect;
  assert.equal(sourceKindForColoredRatio(0.004), 'exam');
  assert.equal(sourceKindForColoredRatio(0.02), 'ambiguous');
  assert.equal(sourceKindForColoredRatio(0.031), 'general');
  assert.equal(sourceKindForColoredRatio(NaN), 'ambiguous');
  assert.equal(coloredPixelRatio(new Uint8ClampedArray(0), 0, 0), 0);
});

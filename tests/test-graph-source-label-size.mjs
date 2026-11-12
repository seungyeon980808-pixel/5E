// 11-12: 복원 그래프 글자 크기를 원본 눈금 숫자 높이로 바로잡는다(js/graph/source-label-size.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureTickLabelHeights, calibratePlanLabelSize } from '../js/graph/source-label-size.js';

// 흰 바탕에 축(세로선)과 왼쪽 눈금 숫자 자리(검은 네모 = 높이 glyph)를 그린 가짜 원본.
function source({ glyph = 20, ticks = [0, .5, 1], width = 400, height = 300 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dot = (x, y) => { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  const pb = { x: 100, y: 40, w: 260, h: 200 };
  for (let y = pb.y; y <= pb.y + pb.h; y++) dot(pb.x, y);           // y축
  for (let x = pb.x; x <= pb.x + pb.w; x++) dot(x, pb.y + pb.h);     // x축
  for (const t of ticks) {
    const cy = Math.round(pb.y + (1 - t) * pb.h);
    for (let y = cy - glyph / 2; y < cy + glyph / 2; y++) for (let x = pb.x - 30; x < pb.x - 12; x += 3) dot(x, Math.round(y));
  }
  return { px: { width, height, data }, pb };
}
const planFor = (pb, fontSizePx, ticks = [0, .5, 1]) => ({
  source: { plotBox: pb }, axisPlacement: { x: { value: 0 }, y: { value: 0 } }, style: { fontSizePx },
  axes: { x: { ticks: [] }, y: { ticks: ticks.map((t, i) => ({ label: String(i * 10), value: i * 10, sourcePosition: t })) } },
  annotations: [{ kind: 'text', text: 'A', fontSizePx: fontSizePx * 1.2 }],
});

test('numeric tick glyph heights are measured from source pixels', () => {
  const { px, pb } = source({ glyph: 20 });
  const heights = measureTickLabelHeights(px, planFor(pb, 30));
  assert.equal(heights.length, 3);
  for (const m of heights) assert.ok(Math.abs(m.h - 20) <= 1, `height ${m.h}`);
});

test('a far-off AI font estimate is replaced by the measured median and annotations keep their ratio', () => {
  const { px, pb } = source({ glyph: 20 });
  const { plan, report } = calibratePlanLabelSize(planFor(pb, 30), px);
  assert.equal(report.applied, true);
  assert.ok(Math.abs(plan.style.fontSizePx - 20) <= 1);
  assert.ok(Math.abs(plan.annotations[0].fontSizePx / plan.style.fontSizePx - 1.2) < 1e-9);
});

test('missing ticks and a single measurement leave the plan unchanged; a measured plan is marked', () => {
  const { px, pb } = source({ glyph: 20 });
  const close = calibratePlanLabelSize(planFor(pb, 21), px).plan;
  assert.equal(close.style.fontSizeMeasured, true);
  const one = planFor(pb, 30, [.5]);
  assert.equal(calibratePlanLabelSize(one, px).plan, one);
  const none = { ...planFor(pb, 30), axes: { x: { ticks: [] }, y: { ticks: [{ label: 't_0', sourcePosition: .5 }] } } };
  assert.equal(calibratePlanLabelSize(none, px).plan, none);
});

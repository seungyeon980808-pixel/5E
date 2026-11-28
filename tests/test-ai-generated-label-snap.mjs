// LEADERFIX(11-22) 생성 그림 「확정하고 라벨 살리기」 자리 맞춤(화면 없는 조각).
//  - 반 글자쯤 비켜 읽은 글자 상자를 원본 글자 잉크에 맞춘다(못 찾으면 AI 자리)
//  - 지우기를 못 믿는 지시선(빗금을 지남)도 픽셀에서 찾은 선을 traced로 돌려주고, 다시 그린 그림의 5E 지시선은 그것을 먼저 쓴다
//  - 다시 그린 그림의 밀림을 재어 조금 밀렸으면 맞추고, 모양이 바뀌었으면 쓰지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseLabelsAndLeaders } from '../js/ai-label-leader-erase.js';
import { snapReadItemsToGlyphInk, eraseBoxOf, finalLabelItems, redrawAlignment, withGlyphLabelSizes } from '../js/ai-generated-label-snap.js';

function canvas(W, H, paper = 255) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = paper; rgba[i * 4 + 3] = 255; }
  return rgba;
}
const put = (rgba, W, H, x, y, v = 10) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = Math.min(rgba[i], v); };
function line(rgba, W, H, x1, y1, x2, y2, thick = 3) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let s = 0; s <= n; s++) {
    const cx = x1 + (x2 - x1) * s / n, cy = y1 + (y2 - y1) * s / n;
    for (let dy = -thick; dy <= thick; dy++) for (let dx = -thick; dx <= thick; dx++) if (Math.hypot(dx, dy) <= thick / 2) put(rgba, W, H, Math.round(cx + dx), Math.round(cy + dy));
  }
}
// 한글 한 글자 대신: 속이 빈 네모(ㅁ) + 가운데 세로획. 글자 크기 size, 획 3점.
function hangul(rgba, W, H, x0, y0, size) {
  for (let k = 0; k < 3; k++) {
    for (let x = x0; x < x0 + size; x++) { put(rgba, W, H, x, y0 + k); put(rgba, W, H, x, y0 + size - 1 - k); }
    for (let y = y0; y < y0 + size; y++) { put(rgba, W, H, x0 + k, y); put(rgba, W, H, x0 + size - 1 - k, y); }
  }
  for (let y = y0 + 5; y < y0 + size - 5; y++) for (let k = -1; k <= 1; k++) put(rgba, W, H, x0 + (size >> 1) + k, y);
}
const word = (rgba, W, H, x0, y0, chars, size = 26, gap = 4) => { for (let c = 0; c < chars; c++) hangul(rgba, W, H, x0 + c * (size + gap), y0, size); return { x0, y0, x1: x0 + chars * (size + gap) - gap - 1, y1: y0 + size - 1 }; };
const norm = (b, W, H) => ({ x: b.x0 / W, y: b.y0 / H, w: (b.x1 - b.x0 + 1) / W, h: (b.y1 - b.y0 + 1) / H });

test('반 글자 비켜 읽은 상자를 실제 글자 잉크로 맞춘다 · 잉크가 없으면 AI 자리 그대로', () => {
  const W = 400, H = 240, rgba = canvas(W, H);
  const truth = word(rgba, W, H, 60, 80, 2);
  line(rgba, W, H, 300, 20, 300, 220, 4); // 떨어진 그림 선
  const box = norm(truth, W, H), hpx = truth.y1 - truth.y0 + 1;
  const read = [
    { text: '시상', kind: 'ko', x: box.x + hpx * 0.3 / W, y: box.y + hpx * 0.5 / H, w: box.w, h: box.h, leader: null },
    { text: '없음', kind: 'ko', x: 150 / W, y: 160 / H, w: 50 / W, h: 26 / H, leader: null },
  ];
  const snapped = snapReadItemsToGlyphInk(rgba, W, H, read);
  const g = snapped[0].glyph;
  assert.ok(g, '글자를 찾음');
  const cx = (g.x + g.w / 2) * W, cy = (g.y + g.h / 2) * H, tx = (truth.x0 + truth.x1 + 1) / 2, ty = (truth.y0 + truth.y1 + 1) / 2;
  assert.ok(Math.hypot(cx - tx, cy - ty) <= 1.5, `가운데 ${cx},${cy} / 실제 ${tx},${ty}`);
  assert.equal(snapped[1].glyph, null, '빈 곳은 찾지 않음');
  const erase = eraseBoxOf(snapped[0]);
  assert.ok(erase.x <= g.x && erase.y <= g.y && erase.x + erase.w >= read[0].x + read[0].w - 1e-9, '지울 창은 두 상자를 합친 것');
  const final = finalLabelItems(snapped, snapped.map(item => ({ ...item, leader: null })));
  assert.deepEqual([final[0].x, final[0].y, final[0].glyphSnapped], [g.x, g.y, true]);
  assert.deepEqual([final[1].x, final[1].y, final[1].glyphSnapped], [read[1].x, read[1].y, false]);
  assert.ok(!('glyph' in final[0]));
});

test('빗금을 지나 지우지 못한 지시선: 그림엔 남기고(다시 그리지 않으면 지시선 없음) 찾은 선은 traced로, 다시 그린 그림에선 그 선을 쓴다', () => {
  const W = 420, H = 260, rgba = canvas(W, H);
  const t = word(rgba, W, H, 300, 40, 2);
  const start = { x: t.x0 - 6, y: (t.y0 + t.y1) / 2 }, end = { x: 90, y: 180 };
  line(rgba, W, H, start.x, start.y, end.x, end.y, 3);
  for (let x = 120; x <= 260; x += 7) line(rgba, W, H, x, 60, x, 240, 2); // 세로 결(빗금)
  const box = norm(t, W, H), hpx = t.y1 - t.y0 + 1;
  const off = { x1: (start.x + 6) / W, y1: (start.y + 10) / H, x2: (end.x + 9) / W, y2: (end.y - 8) / H };
  const read = [{ text: '소뇌', kind: 'ko', x: box.x + hpx * 0.3 / W, y: box.y + hpx * 0.5 / H, w: box.w, h: box.h, leader: off }];
  const snapped = snapReadItemsToGlyphInk(rgba, W, H, read);
  assert.ok(snapped[0].glyph);
  const items = snapped.map(({ glyph, ...item }) => ({ ...item, ...eraseBoxOf({ ...item, glyph }) }));
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'kept', JSON.stringify(out.leaders));
  assert.equal(out.items[0].leader, null);
  const tr = out.items[0].traced;
  assert.ok(tr, `찾은 선을 돌려줌 (${out.leaders[0].reason})`);
  assert.ok(Math.hypot(tr.x2 * W - end.x, tr.y2 * H - end.y) <= 4, `가리키는 끝 ${tr.x2 * W},${tr.y2 * H}`);
  assert.ok(Math.hypot(tr.x1 * W - start.x, tr.y1 * H - start.y) <= 4, `글자 쪽 끝 ${tr.x1 * W},${tr.y1 * H}`);
  // 다시 그리지 않음 → 원래 선이 그림에 남으므로 5E 지시선 없음(두 줄 방지), 글자 자리는 잉크
  const inPlace = finalLabelItems(snapped, out.items, { redrawn: false });
  assert.equal(inPlace[0].leader, null);
  assert.equal(inPlace[0].x, snapped[0].glyph.x);
  // 다시 그림 → 읽은 끝점(9,-8 비킴)이 아니라 찾은 선
  const redrawn = finalLabelItems(snapped, out.items, { redrawn: true });
  assert.deepEqual(redrawn[0].leader, tr);
  // 찾은 선도 없으면 마지막으로 읽은 끝점
  assert.deepEqual(finalLabelItems(snapped, [{ ...out.items[0], traced: undefined }], { redrawn: true })[0].leader, off);
});

test('곧은 지시선을 지운 경우는 예전처럼 지운 선 끝점으로 5E 지시선', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  const t = word(rgba, W, H, 20, 30, 2);
  line(rgba, W, H, t.x1 + 6, 43, 200, 120);
  line(rgba, W, H, 202, 20, 202, 190, 3);
  const box = norm(t, W, H);
  const read = [{ text: '유리', kind: 'ko', ...box, leader: { x1: (t.x1 + 7) / W, y1: 44 / H, x2: 198 / W, y2: 118 / H } }];
  const snapped = snapReadItemsToGlyphInk(rgba, W, H, read);
  const out = eraseLabelsAndLeaders(rgba, W, H, snapped.map(({ glyph, ...item }) => ({ ...item, ...eraseBoxOf({ ...item, glyph }) })));
  assert.equal(out.leaders[0].status, 'erased');
  assert.deepEqual(finalLabelItems(snapped, out.items, { redrawn: false })[0].leader, out.items[0].leader);
});

function scene(W, H, { dx = 0, dy = 0, scale = 1 } = {}) {
  const rgba = canvas(W, H);
  const P = (x, y) => [Math.round((x - W / 2) * scale + W / 2 + dx), Math.round((y - H / 2) * scale + H / 2 + dy)];
  const L = (a, b, c, d, t = 3) => { const [x1, y1] = P(a, b), [x2, y2] = P(c, d); line(rgba, W, H, x1, y1, x2, y2, t); };
  L(40, 40, 360, 40); L(360, 40, 360, 260); L(360, 260, 40, 260); L(40, 260, 40, 40);
  L(80, 200, 200, 80); L(200, 80, 320, 220); L(120, 150, 280, 150, 2);
  for (let k = 0; k < 360; k += 12) { const a = k * Math.PI / 180; L(200 + 50 * Math.cos(a), 170 + 50 * Math.sin(a), 200 + 50 * Math.cos(a + 0.21), 170 + 50 * Math.sin(a + 0.21), 2); }
  return rgba;
}

test('다시 그린 그림의 밀림: 같은 자리면 0, 조금 밀렸으면 되돌릴 만큼, 모양이 바뀌었으면 쓰지 않음', () => {
  const W = 400, H = 300, src = scene(W, H);
  const same = redrawAlignment(src, scene(W, H), W, H, []);
  assert.deepEqual([same.ok, same.dx, same.dy], [true, 0, 0], JSON.stringify(same));
  const moved = redrawAlignment(src, scene(W, H, { dx: 3, dy: -2 }), W, H, []);
  assert.deepEqual([moved.ok, moved.dx, moved.dy], [true, -3, 2], JSON.stringify(moved));
  const warped = redrawAlignment(src, scene(W, H, { scale: 1.12 }), W, H, []);
  assert.equal(warped.ok, false, JSON.stringify(warped));
  // 글자·지시선 자리는 비교에서 뺀다: 원본에만 있는 글자는 점수를 깎지 않는다
  const withText = scene(W, H); const t = word(withText, W, H, 60, 60, 3);
  const skip = redrawAlignment(withText, scene(W, H), W, H, [{ ...norm(t, W, H), glyph: null }]);
  assert.ok(skip.ok && skip.score >= same.score - 0.01, JSON.stringify(skip));
});

test('잉크에 맞춘 라벨만 잰 글자 크기를 쓴다', () => {
  const plan = Object.freeze({ labels: Object.freeze([{ id: 'L0', measuredSize: 0.03 }, { id: 'L1', measuredSize: 0.03 }]) });
  const next = withGlyphLabelSizes(plan, [{ glyphSnapped: true }, { glyphSnapped: false }], new Map([['L0', 0.05], ['L1', 0.05]]));
  assert.deepEqual(next.labels.map(l => l.measuredSize), [0.05, 0.03]);
  assert.ok(Object.isFrozen(next) && Object.isFrozen(next.labels[0]));
  assert.equal(withGlyphLabelSizes(plan, [], null), plan);
});

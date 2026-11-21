// LEADERFIX(11-20) 「확정하고 라벨 살리기」 지시선 처리: 곧은 지시선은 지우고 5E 지시선 라벨로, 확실하지 않으면 원래 선을 남기고 지시선 없는 라벨로.
// 다른 그림 선은 지우지 않는다. 지운 글자 자리에 글자 자국(옅은 윤곽)이 남지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { eraseLabelsAndLeaders, flattenOnWhite } from '../js/ai-label-leader-erase.js';
import { eraseGlyphsInBoxes } from '../js/ai-create-chat.js';

const require = createRequire(import.meta.url);

function canvas(W, H, paper = 252) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = paper; rgba[i * 4 + 3] = 255; }
  return rgba;
}
const lum = (rgba, W, x, y) => { const i = (y * W + x) * 4; return rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114; };
// 굵기 thick의 선분(가장자리 1점은 회색 번짐).
function line(rgba, W, H, x1, y1, x2, y2, thick = 3, ink = 10) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - thick - 2)), maxX = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + thick + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - thick - 2)), maxY = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + thick + 2));
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
    const d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
    const i = (y * W + x) * 4;
    const v = d <= thick / 2 ? ink : d <= thick / 2 + 1 ? 200 : null;
    if (v !== null && (rgba[i + 3] === 0 || v < rgba[i])) { rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
  }
}
function disk(rgba, W, cx, cy, r, ink = 10) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (Math.hypot(x - cx, y - cy) <= r) { const i = (y * W + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = ink; }
  }
}
// 글자 대신: 상자 안 굵은 획 몇 개(+ 둘레 옅은 번짐 4점, 선명하게 키운 그림처럼).
function glyph(rgba, W, x0, y0, w, h) {
  for (let k = 0; k < 3; k++) {
    const x = x0 + 3 + k * Math.floor((w - 6) / 3);
    for (let y = y0 + 2; y < y0 + h - 2; y++) for (let dx = -6; dx <= 8; dx++) {
      const d = dx < 0 ? -dx : dx > 2 ? dx - 2 : 0;
      const v = d === 0 ? 5 : 252 - Math.max(0, 12 - d * 2);
      const i = (y * W + x + dx) * 4;
      if (v < rgba[i]) rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    }
  }
}
const box = (x, y, w, h, W, H) => ({ x: x / W, y: y / H, w: w / W, h: h / H });

test('곧은 지시선: 선을 지우고 실제 두 끝으로 지시선 라벨, 가리키는 물체 선은 그대로', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  glyph(rgba, W, 20, 30, 50, 24);
  line(rgba, W, H, 74, 50, 200, 120);            // 지시선: 글자 오른쪽 아래에서 물체로
  line(rgba, W, H, 202, 20, 202, 190, 3);         // 물체(세로 벽)
  const items = [{ text: '유리 막대', kind: 'ko', ...box(20, 30, 50, 24, W, H), leader: { x1: 75 / W, y1: 51 / H, x2: 198 / W, y2: 118 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'erased', JSON.stringify(out.leaders));
  const leader = out.items[0].leader;
  assert.ok(leader, '지시선 라벨로 남는다');
  assert.ok(Math.abs(leader.x1 * W - 74) < 8 && Math.abs(leader.y1 * H - 50) < 8, `글자 쪽 끝 ${leader.x1 * W},${leader.y1 * H}`);
  assert.ok(leader.x2 * W > 185 && leader.x2 * W < 205, `가리키는 끝 ${leader.x2 * W}`);
  // 지시선 가운데는 지워짐
  for (const t of [0.2, 0.5, 0.8]) {
    const x = Math.round(74 + (200 - 74) * t), y = Math.round(50 + 70 * t);
    assert.ok(lum(rgba, W, x, y) > 240, `지시선 점 (${x},${y}) ${lum(rgba, W, x, y)}`);
  }
  // 벽은 위·아래 모두 그대로(끊기지 않음)
  for (let y = 20; y <= 190; y++) assert.ok(lum(rgba, W, 202, y) < 100, `벽 (${202},${y}) ${lum(rgba, W, 202, y)}`);
});

test('다른 선과 엇갈려도 그 선은 끊지 않는다', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  glyph(rgba, W, 20, 30, 50, 24);
  line(rgba, W, H, 74, 50, 230, 140);
  line(rgba, W, H, 100, 180, 200, 20, 3);          // 비스듬히 엇갈리는 팔 윤곽
  const items = [{ text: '유리 막대', kind: 'ko', ...box(20, 30, 50, 24, W, H), leader: { x1: 75 / W, y1: 51 / H, x2: 228 / W, y2: 138 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'erased');
  for (let s = 0; s <= 1; s += 0.01) {
    const x = Math.round(100 + 100 * s), y = Math.round(180 - 160 * s);
    assert.ok(lum(rgba, W, x, y) < 120, `팔 윤곽 (${x},${y}) ${lum(rgba, W, x, y)}`);
  }
  // 엇갈린 자리에서 멀리 떨어진 지시선 점은 지워짐
  assert.ok(lum(rgba, W, 100, 65) > 240 && lum(rgba, W, 210, 128) > 240);
});

test('화살촉이 글자 쪽에 있는 과정 화살표는 지시선이 아니다: 그대로 두고 라벨은 지시선 없이', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  glyph(rgba, W, 120, 10, 50, 24);
  line(rgba, W, H, 145, 40, 145, 180);
  line(rgba, W, H, 145, 40, 137, 54); line(rgba, W, H, 145, 40, 153, 54);   // 화살촉
  for (let y = 42; y < 54; y++) for (let x = 145 - Math.floor((y - 40) * 0.55); x <= 145 + Math.floor((y - 40) * 0.55); x++) { const i = (y * W + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 10; }
  const before = rgba.slice();
  const items = [{ text: 'NADPH', kind: 'math', ...box(120, 10, 50, 24, W, H), leader: { x1: 145 / W, y1: 40 / H, x2: 145 / W, y2: 180 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'kept');
  assert.equal(out.items[0].leader, null, '두 줄이 되지 않게 5E 지시선을 만들지 않음');
  for (let y = 40; y <= 180; y++) { const i = (y * W + 145) * 4; assert.equal(rgba[i], before[i], `화살표 (${145},${y}) 그대로`); }
});

test('굽은 화살표의 곧은 부분만 잡혀도 글자 쪽 끝 너머로 선이 이어지면 건드리지 않는다', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  glyph(rgba, W, 10, 20, 40, 24);
  // 글자 옆(56,40)에서 시작해 휘었다가 곧게 내려가는 선
  line(rgba, W, H, 56, 52, 70, 60); line(rgba, W, H, 70, 60, 90, 64); line(rgba, W, H, 90, 64, 200, 150);
  const before = rgba.slice();
  const items = [{ text: '산소', kind: 'ko', ...box(10, 20, 40, 24, W, H), leader: { x1: 92 / W, y1: 66 / H, x2: 200 / W, y2: 150 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'kept', JSON.stringify(out.leaders));
  assert.equal(out.items[0].leader, null);
  const i = (100 * W + 136) * 4; assert.equal(rgba[i], before[i]);
});

test('끝에 점이 달린 지시선(·—)은 지금은 그대로 둔다(5E 지시선에 채운 점 끝이 없음)', () => {
  const W = 300, H = 200, rgba = canvas(W, H);
  glyph(rgba, W, 200, 90, 50, 24);
  line(rgba, W, H, 196, 102, 90, 110);
  disk(rgba, W, 88, 110, 5);
  const items = [{ text: '모암', kind: 'ko', ...box(200, 90, 50, 24, W, H), leader: { x1: 196 / W, y1: 102 / H, x2: 88 / W, y2: 110 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'kept');
  assert.equal(out.items[0].leader, null);
  assert.ok(lum(rgba, W, 140, 106) < 100, '선은 그림에 남음');
});

test('읽기가 말한 지시선이 그림에 없으면 아무것도 지우지 않고 지시선 없는 라벨', () => {
  const W = 200, H = 120, rgba = canvas(W, H);
  glyph(rgba, W, 20, 30, 40, 24);
  line(rgba, W, H, 120, 10, 120, 110);
  const items = [{ text: 'A', kind: 'en', ...box(20, 30, 40, 24, W, H), leader: { x1: 62 / W, y1: 50 / H, x2: 110 / W, y2: 90 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'kept');
  assert.equal(out.items[0].leader, null);
  for (let y = 10; y <= 110; y++) assert.ok(lum(rgba, W, 120, y) < 100);
});

test('글자 자국 없음: 둘레 번짐(4점)까지 지워 바탕과 3 넘게 다른 점이 남지 않는다', () => {
  const W = 160, H = 80, rgba = canvas(W, H, 252);
  glyph(rgba, W, 30, 20, 60, 30);
  eraseGlyphsInBoxes(rgba, W, H, [box(30, 20, 60, 30, W, H)]);
  let worst = 0;
  for (let y = 14; y < 56; y++) for (let x = 20; x < 100; x++) worst = Math.max(worst, Math.abs(lum(rgba, W, x, y) - 252));
  assert.ok(worst <= 3, `가장 큰 차이 ${worst}`);
});

test('투명 바탕 그림도 검은 줄 없이 흰 종이로 지운다', () => {
  const W = 200, H = 120, rgba = new Uint8ClampedArray(W * H * 4); // 모두 투명(0,0,0,0)
  for (let y = 30; y < 54; y++) for (let x = 30; x < 70; x += 12) for (let k = 0; k < 3; k++) { const i = (y * W + x + k) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; rgba[i + 3] = 255; }
  line(rgba, W, H, 74, 50, 170, 100);
  const items = [{ text: 'A', kind: 'en', ...box(28, 28, 46, 28, W, H), leader: { x1: 75 / W, y1: 51 / H, x2: 168 / W, y2: 99 / H } }];
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.equal(out.leaders[0].status, 'erased', JSON.stringify(out.leaders));
  let dark = 0;
  for (let i = 0; i < W * H; i++) { assert.equal(rgba[i * 4 + 3], 255); if (rgba[i * 4] < 200) dark++; }
  assert.equal(dark, 0, '남은 진한 점');
  const check = new Uint8ClampedArray([0, 0, 0, 0, 10, 10, 10, 128]); flattenOnWhite(check);
  assert.deepEqual([...check], [255, 255, 255, 255, 132, 132, 132, 255]);
});

test('실제 그림(11-20 사용자 그림 조각 + 실제 읽기 결과): 지시선 둘 다 지우고 비커 벽·잎은 남고 글자 자국 없음', () => {
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(new URL('./fixtures/label-leader/stir-crop.png', import.meta.url)));
  const { items } = JSON.parse(fs.readFileSync(new URL('./fixtures/label-leader/stir-crop-read.json', import.meta.url), 'utf8'));
  const W = png.width, H = png.height, rgba = new Uint8ClampedArray(png.data), before = new Uint8ClampedArray(png.data);
  const out = eraseLabelsAndLeaders(rgba, W, H, items);
  assert.deepEqual(out.leaders.map(l => l.status), ['erased', 'erased'], JSON.stringify(out.leaders));
  for (const item of out.items) assert.ok(item.leader, `${item.text} 지시선 라벨`);
  // 글자 상자 안: 진한 점 0, 바탕(가장자리 가운데값)과 8 넘게 다른 점 0
  for (const item of items) {
    const x0 = Math.ceil(item.x * W), y0 = Math.ceil(item.y * H), x1 = Math.min(W - 1, Math.floor((item.x + item.w) * W)), y1 = Math.floor((item.y + item.h) * H);
    let dark = 0, ghost = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = lum(rgba, W, x, y); if (v < 200) dark++; else if (v < 238) ghost++; }
    assert.equal(dark, 0, `${item.text} 진한 점`);
    assert.equal(ghost, 0, `${item.text} 옅은 자국`);
  }
  // 지시선 가운데(물체에서 먼 곳)는 바탕만
  for (const item of out.items) {
    const { x1, y1, x2, y2 } = item.leader;
    for (const t of [0.15, 0.3]) {
      const x = Math.round((x1 + (x2 - x1) * t) * W), y = Math.round((y1 + (y2 - y1) * t) * H);
      let darkest = 255; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) darkest = Math.min(darkest, lum(rgba, W, x + dx, y + dy));
      assert.ok(darkest > 200, `${item.text} 지시선 ${t} (${x},${y}) ${darkest}`);
    }
  }
  // 지시선·글자 둘레 밖의 그림 점은 하나도 바뀌지 않는다(다른 획 보존)
  const near = new Uint8Array(W * H);
  const mark = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x + dx), yy = Math.round(y + dy); if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1; } };
  for (let k = 0; k < items.length; k++) {
    const it = items[k], ld = out.items[k].leader;
    for (let y = Math.floor(it.y * H) - 14; y <= (it.y + it.h) * H + 14; y++) for (let x = Math.floor(it.x * W) - 14; x <= (it.x + it.w) * W + 14; x++) mark(x, y, 0);
    const n = Math.ceil(Math.hypot((ld.x2 - ld.x1) * W, (ld.y2 - ld.y1) * H));
    for (let s = 0; s <= n; s++) mark((ld.x1 + (ld.x2 - ld.x1) * s / n) * W, (ld.y1 + (ld.y2 - ld.y1) * s / n) * H, 9);
  }
  let changedFar = 0;
  for (let k = 0; k < W * H; k++) if (!near[k] && Math.abs(rgba[k * 4] - before[k * 4]) > 2) changedFar++;
  assert.equal(changedFar, 0, '지시선·글자에서 먼 점이 바뀜');
  // 지워진 진한 점(원래 lum<120) 중 지시선 띠(±3점) 밖에 있던 것 = 다른 획을 지운 것 → 0
  let strokeLost = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (lum(before, W, x, y) >= 120 || lum(rgba, W, x, y) < 200) continue;
    const onText = items.some(it => x >= it.x * W - 14 && x <= (it.x + it.w) * W + 14 && y >= it.y * H - 14 && y <= (it.y + it.h) * H + 14);
    if (onText) continue;
    const onLeader = out.items.some(({ leader: l }) => {
      const ax = l.x1 * W, ay = l.y1 * H, bx = l.x2 * W, by = l.y2 * H, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= 3;
    });
    if (!onLeader) strokeLost++;
  }
  assert.equal(strokeLost, 0, '지시선 밖의 그림 선 점을 지움');
});

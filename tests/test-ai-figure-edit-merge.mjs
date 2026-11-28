// 1.7.3 ⑫ 연속 고치기 누적 변화: 「바뀐 곳만 붙이기」(mergeEditPixels·makeEditMerge·runEdit composite) 단위 검사 — 가짜 그림·가짜 AI만.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEditPixels, makeEditMerge } from '../js/ai-figure/edit.js';
import { createEngine, makeIndex } from '../js/ai-figure/index.js';

const W = 400, H = 200;
const SCALE = { jitter: 0.03, strongJitter: 0.011 }; // 작은 검사 그림(짧은 변 200px)에서 실제 그림(약 900px)의 떨림 허용 6px과 맞춤
function canvas(fill = 255) { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = fill; d[i + 3] = 255; } return { width: W, height: H, data: d }; }
const rect = (img, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; } };
const px = (img, x, y) => img.data[(y * img.width + x) * 4];
// 바탕 그림: 왼쪽 상자 테두리(검정), 가운데 회색 면, 오른쪽 가로선.
function base({ shift = 0, grayFill = 200, line = 0 } = {}) {
  const c = canvas();
  rect(c, 20 + shift, 40, 120 + shift, 44, line); rect(c, 20 + shift, 140, 120 + shift, 144, line); rect(c, 20 + shift, 40, 24 + shift, 144, line); rect(c, 116 + shift, 40, 120 + shift, 144, line);
  rect(c, 150, 60, 230, 140, grayFill);
  rect(c, 260, 100 + shift, 380, 103 + shift, line);
  return c;
}

test('mergeEditPixels: 지시한 곳(새 점)만 고친 그림에서, 떨림·옅은 회색 변화는 앞 그림 그대로', () => {
  const before = base();
  const after = base({ shift: 2, grayFill: 214, line: 40 }); // AI가 다시 그리며 2px 밀림·회색 면 밝아짐·선이 옅어짐
  rect(after, 300, 30, 330, 60, 0); // 지시한 것: 오른쪽 위 검은 네모 추가
  const r = mergeEditPixels(before, after, SCALE);
  assert.equal(r.stats.changed, true);
  assert.equal(r.stats.keptBlobs, 1, JSON.stringify(r.stats.blobs));
  assert.ok(px(r, 315, 45) < 30, '추가한 네모는 들어옴');
  assert.equal(px(r, 190, 100), 200, '회색 면은 앞 그림 값(200) 그대로');
  assert.equal(px(r, 21, 100), 0, '상자 선은 앞 그림 자리 그대로');
  assert.equal(px(r, 300, 101), 0, '가로선도 앞 그림 그대로');
  assert.equal(r.width, W); assert.equal(r.height, H);
});

test('mergeEditPixels: 지운 것(옅은 회색 포함)은 잔상 없이 지워진다', () => {
  const before = base(); rect(before, 290, 20, 360, 70, 225); rect(before, 290, 20, 360, 23, 0); // 옅은 회색 상자 + 윗변
  const after = base();
  const r = mergeEditPixels(before, after, SCALE);
  assert.equal(r.stats.keptBlobs, 1);
  assert.equal(px(r, 320, 50), 255, '옅은 회색 상자 자리가 흰색');
  assert.equal(px(r, 320, 21), 255);
});

test('mergeEditPixels: 바뀐 것이 없으면 changed=false, 영역(region)을 주면 그 밖 변화는 버림', () => {
  const before = base();
  assert.equal(mergeEditPixels(before, base({ shift: 1 }), SCALE).stats.changed, false);
  const after = base(); rect(after, 300, 30, 330, 60, 0); rect(after, 40, 160, 80, 190, 0);
  const r = mergeEditPixels(before, after, { ...SCALE, region: [0.7, 0.1, 0.25, 0.3] });
  assert.ok(px(r, 315, 45) < 30, '영역 안 추가는 들어옴');
  assert.equal(px(r, 60, 175), 255, '영역 밖 추가는 버림');
});

test('mergeEditPixels: 고친 그림 크기가 달라도(늘려 맞춤) 앞 그림 크기로 돌려준다', () => {
  const before = base();
  const big = { width: W * 2, height: H * 2, data: new Uint8ClampedArray(W * H * 16) };
  const after = base(); rect(after, 300, 30, 330, 60, 0);
  for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) { const s = ((y >> 1) * W + (x >> 1)) * 4, d = (y * W * 2 + x) * 4; for (let k = 0; k < 4; k++) big.data[d + k] = after.data[s + k]; }
  const r = mergeEditPixels(before, big, SCALE);
  assert.equal(r.width, W); assert.ok(px(r, 315, 45) < 40);
});

// ── 엔진 길: composite로 makeEditMerge를 넣으면 붙인 그림이 결과가 되고, 붙인 그림에서 지시가 안 보이면 고친 그림 그대로 ──
const imgs = new Map(); let serial = 0;
const toUrl = (img) => { const id = `data:image/png;base64,${Buffer.from('img' + (++serial)).toString('base64')}`; imgs.set(id, img); return id; };
const merge = makeEditMerge({ decode: async (u) => imgs.get(u), encode: async (r) => toUrl(r), ...SCALE });
function fakeAi({ verify, after }) {
  const calls = { text: [], image: [] }; let v = 0;
  return { calls, ai: {
    async readText({ text, attachments }) { calls.text.push({ text, attachments }); if (text.includes('교사가 이 그림에서 일부만')) return '{"targets":["네모"],"keep":["상자"],"summary":"네모 추가","mode":"draw"}'; return verify[Math.min(v++, verify.length - 1)]; },
    async generateImage({ text, attachments }) { calls.image.push({ text, attachments }); return after; },
  } };
}
const OK = '{"done":true,"unwanted":[],"sentences":[]}';

test('editFigure composite: 바뀐 덩어리만 붙인 그림을 결과로, 기록(edit.merge)을 남긴다', async () => {
  const prev = toUrl(base()); const a = base({ shift: 2, grayFill: 214 }); rect(a, 300, 30, 330, 60, 0); const after = toUrl(a);
  const { ai, calls } = fakeAi({ verify: [OK], after });
  const eng = createEngine({ ai, index: makeIndex({}), grayscale: async (d) => ({ data: d, applied: true }), retries: { text: 1, image: 1 }, composite: merge });
  const r = await eng.editFigure({ previousPng: prev, instruction: '오른쪽 위에 검은 네모', composite: true, localText: false });
  assert.equal(r.ok, true);
  const out = imgs.get(r.scenes[0].image);
  assert.ok(out && out !== a, '붙인 그림');
  assert.equal(px(out, 190, 100), 200);
  assert.equal(r.edit.merge.used, true); assert.equal(r.edit.merge.keptBlobs, 1);
  assert.equal(calls.text.filter((c) => c.text.includes('첫 그림은 고치기 전'))[0].attachments[1], r.scenes[0].image, '확인은 붙인 그림으로');
});

test('editFigure composite: 붙인 그림에서 지시가 안 보인다고 하면 고친 그림 그대로를 확인해 쓴다', async () => {
  const prev = toUrl(base()); const a = base(); rect(a, 300, 30, 330, 60, 0); const after = toUrl(a);
  const { ai } = fakeAi({ verify: ['{"done":false,"unwanted":[],"sentences":[]}', OK], after });
  const eng = createEngine({ ai, index: makeIndex({}), grayscale: async (d) => ({ data: d, applied: true }), retries: { text: 1, image: 1 }, composite: merge });
  const r = await eng.editFigure({ previousPng: prev, instruction: '네모', composite: true, localText: false });
  assert.equal(r.ok, true); assert.equal(r.scenes[0].image, after);
  assert.equal(r.edit.merge.fallback, 'merge-lost-edit');
});

test('editFigure: composite를 안 켜면 지금처럼 고친 그림 그대로(merge 기록 없음)', async () => {
  const prev = toUrl(base()); const a = base(); rect(a, 300, 30, 330, 60, 0); const after = toUrl(a);
  const { ai } = fakeAi({ verify: [OK], after });
  const eng = createEngine({ ai, index: makeIndex({}), grayscale: async (d) => ({ data: d, applied: true }), retries: { text: 1, image: 1 }, composite: merge });
  const r = await eng.editFigure({ previousPng: prev, instruction: '네모', localText: false });
  assert.equal(r.scenes[0].image, after); assert.equal(r.edit.merge, undefined);
});

test('runFigureEdit: canvas가 없으면(node) 붙이기를 켜지 않는다(엔진에 composite를 보내지 않음)', async () => {
  const { runFigureEdit } = await import('../js/ai-engines.js');
  const seen = [];
  const engine = { async editFigure(o) { seen.push(o); return { ok: true, scenes: [{ image: o.previousPng }], edit: {} }; } };
  await runFigureEdit({ ai: {}, engine, previousPng: 'data:image/png;base64,AAAA', instruction: '네모' });
  assert.equal(seen[0].composite, undefined);
  assert.equal(seen[0].originalPng, undefined);
});

test('mergeEditPixels: 고친 그림이 통째로 밀려 오면 맞춰 놓고 비교한다(밀린 선을 바뀐 것으로 보지 않음)', () => {
  const before = base(); rect(before, 300, 150, 360, 180, 120);
  const after = canvas(); const sh = 8;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = x - sh, sy = y - sh; if (sx < 0 || sy < 0) continue; const i = (y * W + x) * 4, j = (sy * W + sx) * 4; for (let k = 0; k < 3; k++) after.data[i + k] = before.data[j + k]; }
  rect(after, 300 + sh, 30 + sh, 330 + sh, 60 + sh, 0);
  const r = mergeEditPixels(before, after, SCALE);
  assert.ok(Math.abs(r.stats.align.tx - sh) <= 1 && Math.abs(r.stats.align.ty - sh) <= 1, JSON.stringify(r.stats.align));
  assert.equal(r.stats.keptBlobs, 1);
  assert.ok(px(r, 315, 45) < 40); assert.equal(px(r, 21, 100), 0);
});

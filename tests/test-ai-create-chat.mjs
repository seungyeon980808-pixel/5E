// 그림 생성 화면(시안 그림생성화면 v4)의 화면 없는 조각: 진행 줄, 결과 카드 칩·설명 줄, 라벨 힌트 대체, 글자만 지우기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStatusRows, settleStatusRows, statusRowText, clockText, resultSubline, resultChips, labelHintsFallback, labelHintPrompt, eraseGlyphsInBoxes } from '../js/ai-create-chat.js';

test('진행 줄: 단계가 넘어가면 앞 줄은 끝남, ✓ 없이 글만 바뀐다(태그 9)', () => {
  let rows = advanceStatusRows([], 'index');
  rows = advanceStatusRows(rows, 'expand');
  assert.equal(rows.length, 1, 'index·expand는 한 줄');
  rows = advanceStatusRows(rows, 'scene');
  rows = advanceStatusRows(rows, 'draw');
  assert.deepEqual(rows.map(row => row.state), ['done', 'done', 'current']);
  assert.equal(statusRowText(rows[2]), '그림을 그리는 중');
  assert.equal(statusRowText(rows[0]), '요청을 그림 설계로 바꿨어요');
  const done = settleStatusRows(rows);
  assert.equal(statusRowText(done[2]), '그림을 그렸어요');
  assert.ok(!done.some(row => /✓/.test(statusRowText(row))));
  assert.equal(advanceStatusRows(rows, 'unknown-phase'), rows, '모르는 단계는 무시');
});

test('진행 줄: 「…중」으로 바꾼 글은 끝나면 단계의 끝난 글, 결과 글은 남는다', () => {
  let rows = advanceStatusRows([], 'scene', { text: '다시 그릴 준비를 하는 중' });
  rows = advanceStatusRows(rows, 'draw');
  assert.equal(statusRowText(rows[0]), '그릴 준비를 마쳤어요');
  let label = advanceStatusRows([], 'label-read', { text: '요청에 적은 라벨 3개를 기준으로 글자 읽는 중 · A B C' });
  label = advanceStatusRows(label, 'label-read', { text: '요청에 적은 라벨 3개를 기준으로 글자 읽음 · 3개 찾음' });
  label = settleStatusRows(advanceStatusRows(label, 'label-erase'));
  assert.equal(statusRowText(label[0]), '요청에 적은 라벨 3개를 기준으로 글자 읽음 · 3개 찾음');
});

test('시간 글은 0:52처럼', () => {
  assert.equal(clockText(52_000), '0:52');
  assert.equal(clockText(65_400), '1:05');
  assert.equal(clockText(undefined), '0:00');
});

test('결과 카드 설명 줄(태그 19·12·30)', () => {
  const r1 = { id: 'g1', name: '생성 결과 1', meta: { refs: ['a', 'b', 'c'], ui: { kind: 'figure', elapsedMs: 52_000 } } };
  const r2 = { id: 'g2', name: '생성 결과 2', meta: { ui: { kind: 'edit', from: 'g1', summary: 'T만 지움', elapsedMs: 18_000 } } };
  const r3 = { id: 'g3', name: '생성 결과 3 · 라벨', meta: { ui: { kind: 'label', from: 'g2', labelCount: 16, elapsedMs: 21_000 } } };
  const items = [r1, r2, r3];
  assert.equal(resultSubline(r1, items), '0:52', '11-20: 참고한 기출 수는 적지 않는다');
  assert.equal(resultSubline(r2, items), '1에서 고침 · T만 지움 · 0:18');
  assert.equal(resultSubline(r3, items), '2를 확정 · 라벨 16개 · 그림은 그대로 · 0:21');
});

test('결과 카드 칩: 보는 카드에만, 고친 결과는 되돌리기, 라벨 결과는 켬·끔·편집(태그 5·14·26·27·30)', () => {
  const r1 = { id: 'g1', name: '생성 결과 1', meta: { ui: { kind: 'figure' } } };
  const r2 = { id: 'g2', name: '생성 결과 2', meta: { ui: { kind: 'edit', from: 'g1' } } };
  const r3 = { id: 'g3', name: '생성 결과 3 · 라벨', labelPlan: { labels: [{}] }, meta: { ui: { kind: 'label', from: 'g2' } } };
  const items = [r1, r2, r3];
  assert.deepEqual(resultChips(r1, { viewing: false, items }), []);
  const first = resultChips(r1, { viewing: true, items });
  assert.deepEqual(first.map(chip => chip.label), ['확정하고 라벨 살리기', '라벨 빼기', '선 진하게', '각도 바꾸기', '새로 그리기']);
  assert.equal(first.find(chip => chip.id === 'bolder').kind, 'fill', '칩은 입력칸에 말만 넣는다');
  const edited = resultChips(r2, { viewing: true, items });
  assert.deepEqual(edited.map(chip => chip.label), ['확정하고 라벨 살리기', '되돌리기(1로)', '선 진하게', '새로 그리기']);
  assert.equal(edited[1].target, 'g1');
  const compared = resultChips(r2, { viewing: true, items, comparing: true, side: 'right' });
  assert.equal(compared[0].label, '비교 닫기');
  assert.ok(!compared.some(chip => chip.id === 'label-restore'), '비교 중에는 라벨 살리기를 감춘다');
  assert.deepEqual(resultChips(r3, { viewing: true, items }).map(chip => chip.label), ['라벨 끄고 보기', '라벨 편집', '되돌리기(2로)']);
  assert.equal(resultChips(r3, { viewing: true, items, labelsOn: false })[0].label, '라벨 켜고 보기');
});

test('라벨 힌트 대체: 한 글자 기호·값+단위, 문단', () => {
  assert.deepEqual(labelHintsFallback('막대 AB의 O점, C에 2m, B에 m인 추, 높이 8a'), ['O', 'C', '2m', 'B', '8a']);
  assert.equal(labelHintPrompt([]), '');
  assert.match(labelHintPrompt(['A', 'B']), /A, B/);
  assert.match(labelHintPrompt(['A']), /목록에 없는 글자가 그림에 있으면 그것도/);
});

test('글자만 지우기: 상자 안 글자는 지우고, 상자를 가로지르는 선은 남긴다(태그 28)', () => {
  const W = 60, H = 40, rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x, y) => { const i = (y * W + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; };
  for (let x = 0; x < W; x++) ink(x, 30);           // 긴 가로선(남아야 함)
  for (let y = 10; y < 18; y++) { ink(20, y); ink(26, y); } // 글자 「H」 모양
  for (let x = 20; x <= 26; x++) ink(x, 14);
  const box = { x: 18 / W, y: 8 / H, w: 11 / W, h: 12 / H };
  const lineBox = { x: 40 / W, y: 26 / H, w: 8 / W, h: 8 / H }; // 선만 지나는 상자
  const out = eraseGlyphsInBoxes(rgba, W, H, [box, lineBox]);
  const dark = (x, y) => rgba[(y * W + x) * 4] < 128;
  assert.ok(!dark(20, 12) && !dark(23, 14) && !dark(26, 16), '글자는 지워짐');
  assert.ok(dark(10, 30) && dark(44, 30), '가로선은 그대로');
  assert.ok(out.erasedPixels > 0);
  assert.equal(out.boxes, 2);
});

test('글자만 지우기: 회색 면 안 글자는 둘레의 회색으로 채운다', () => {
  const W = 40, H = 30, rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 210; rgba[i * 4 + 3] = 255; }
  for (let y = 10; y < 16; y++) { const i = (y * W + 18) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 10; }
  eraseGlyphsInBoxes(rgba, W, H, [{ x: 15 / W, y: 8 / H, w: 6 / W, h: 10 / H }]);
  const i = (12 * W + 18) * 4;
  assert.ok(Math.abs(rgba[i] - 210) <= 2, `회색으로 채움 (${rgba[i]})`);
});

// 기출 카드 그림 자르기(past-crop.js): 문항 번호 ~ 선지 번호 줄, 좌우 폭 일정, 쪽 번호·저작권·과목 탭·단 구분선은 뺀다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pastCropRect,tidyQuestionRect} from '../assets/exampool/sheet/past-crop.js';

// 흰 바탕에 검은 사각형들을 그린 가짜 카드.
function card(W, H, boxes, colored = []) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const paint = ([x, y, w, h], rgb) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const p = (j * W + i) * 4; data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; } };
  boxes.forEach(b => paint(b, [0, 0, 0])); colored.forEach(([b, rgb]) => paint(b, rgb));
  return {data, width: W, height: H};
}
const choices = y => [0, 1, 2, 3, 4].map(k => [120 + k * 120, y, 30, 16]);

test('number at top-left, choices line at the bottom, constant column width', () => {
  const r = pastCropRect(card(775, 600, [[110, 12, 480, 18], [110, 60, 500, 200], ...choices(300), [774, 0, 1, 600]]));
  assert.deepEqual([r.x, r.y], [96, 0]);
  assert.equal(r.width, 662, 'column width (634 + padding) even when content is narrower');
  assert.equal(r.y + r.height, 316 + 14, 'bottom is the choices line');
});

test('page number box, blue copyright line and notice box below the choices are dropped', () => {
  const r = pastCropRect(card(809, 600, [[30, 10, 640, 18], [30, 60, 640, 200], ...choices(300).map(([x, y, w, h]) => [x - 80, y, w, h]), [40, 350, 600, 60], [2, 440, 48, 40]], [[[130, 500, 500, 16], [40, 60, 200]]]));
  assert.equal(r.y + r.height, 316 + 14, 'stops at the choices line');
  assert.ok(r.x >= 16, 'the page number box on the left does not widen the crop');
});

test('a narrow side tab on the far right is not part of the question', () => {
  const r = pastCropRect(card(809, 500, [[30, 10, 640, 18], [30, 60, 640, 200], ...choices(300).map(([x, y, w, h]) => [x - 80, y, w, h]), [740, 20, 30, 120]]));
  assert.ok(r.x + r.width < 740, 'tab excluded');
});

test('graph choices (no single choices line) keep everything above the page number', () => {
  const r = pastCropRect(card(741, 800, [[30, 10, 600, 18], [60, 80, 300, 200], [30, 320, 300, 200], [30, 560, 300, 180], [2, 770, 40, 25]]));
  assert.equal(r.y + r.height, 740 + 14);
});

// 11-22 그림으로 넣는 변형 문항(PDF 크롭 다듬기): 아래 「확인 사항」 상자 조각·빈 여백은 빼고, 내용은 자르지 않는다.
test('tidy: drops the notice box slice under image choices, keeps the choices', () => {
  // 본문 글 0~120, 그림 선지 150~400, 큰 빈칸, 상자 위 테두리 600, 상자 글자 630~(foot=630).
  const img = card(400, 700, [[20, 0, 360, 120], [20, 150, 80, 250], [20, 600, 360, 2], [20, 600, 2, 100], [30, 630, 200, 20]]);
  const r = tidyQuestionRect(img, { foot: 630, keep: 120, reach: 48, gap: 36, pad: 18 });
  assert.equal(r.height, 400 + 18, 'bottom = last choice figure + pad (border line and notice text gone)');
  assert.equal(r.x, 0);
});

test('tidy: never climbs above content that touches the notice box', () => {
  // 그림이 상자 테두리 바로 위(틈 10행)까지 내려와 있으면 테두리를 내용으로 보고 foot에서만 자른다.
  const img = card(400, 700, [[20, 0, 360, 120], [20, 150, 80, 440], [20, 600, 360, 2], [30, 630, 200, 20]]);
  const r = tidyQuestionRect(img, { foot: 630, keep: 120, reach: 48, gap: 36, pad: 18 });
  assert.ok(r.height >= 602, `content kept (${r.height})`);
  assert.ok(r.height <= 630, 'notice text itself is gone');
});

test('tidy: without a notice, only trailing whitespace goes; keep row is a floor', () => {
  const img = card(400, 700, [[20, 0, 360, 120]]);
  assert.equal(tidyQuestionRect(img, { keep: 120, pad: 18 }).height, 138);
  assert.equal(tidyQuestionRect(img, { keep: 300, pad: 18 }).height, 300, 'never above the text bottom row');
  assert.equal(tidyQuestionRect(card(50, 50, []), {}).height, 50, 'blank image stays as is');
});

test('tidy: left trim after the number is erased keeps light grey dotted frames', () => {
  const img = card(400, 300, [[60, 0, 300, 20]], [[[40, 40, 2, 100], [200, 200, 200]]]);
  const r = tidyQuestionRect(img, { left: true, pad: 18 });
  assert.equal(r.x, 22, 'the grey frame at x=40 counts as content');
  assert.equal(tidyQuestionRect(img, {}).x, 0, 'no left trim unless asked');
});

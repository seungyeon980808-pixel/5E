// 11-12: 미리 정한 문항 상자 아래로 마지막 줄(선지·분모)이 삐져나오면 그 줄까지 늘린다.
// 옆 단 세로 띠 글자·쪽 아래 「확인 사항」·아래 문항 첫 줄은 넘보지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extendQuestionRectToWords } from '../js/pdf-library/page-geometry.js';

const w = (text, x, y, width, height) => ({ text, rect: [x, y, width, height] });
const bottomOf = (rect) => +(rect[1] + rect[3]).toFixed(4);

test('choice line overflowing the stored bottom is included with a small pad', () => {
  // 생명Ⅰ 27년 6평 6번: 상자 아래 0.8931, 선지 줄 0.8846~0.8943
  const rect = [0.509, 0.6591, 0.4815, 0.234];
  const out = extendQuestionRectToWords(rect, [w('① ㄱ ② ㄴ', 0.53, 0.8846, 0.4, 0.0097)]);
  assert.equal(bottomOf(out), 0.8983);
});

test('nothing changes when every line is inside', () => {
  const rect = [0.1, 0.1, 0.4, 0.3];
  assert.deepEqual(extendQuestionRectToWords(rect, [w('본문', 0.12, 0.2, 0.3, 0.01)]), rect);
});

test('a narrow lone side-tab glyph does not extend the box', () => {
  const rect = [0.509, 0.4751, 0.4815, 0.1979];
  assert.deepEqual(extendQuestionRectToWords(rect, [w('II', 0.9245, 0.6655, 0.0098, 0.0143)]), rect);
});

test('the footer notice does not extend the box', () => {
  const rect = [0.509, 0.4751, 0.4815, 0.4061];
  assert.deepEqual(extendQuestionRectToWords(rect, [w('※ 확인 사항', 0.5301, 0.8761, 0.0759, 0.0099)]), rect);
});

test('extension stops above the next line that starts below the box', () => {
  const rect = [0.1, 0.5, 0.4, 0.3]; // bottom 0.8
  const out = extendQuestionRectToWords(rect, [
    w('① 1/9', 0.12, 0.792, 0.3, 0.012),
    w('다음 줄', 0.12, 0.806, 0.3, 0.01),
  ]);
  assert.equal(bottomOf(out), 0.805);
});

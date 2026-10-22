// 조판 부호(10-22 17번): 고정 띄어쓰기 V 자리와 내어쓰기 기준점(둘째 줄이 생긴 문단만)을 rhwp 글자 정보에서 고른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marksForRuns, FIXED_SPACE } from '../js/rhwp-exam-marks.js';

const run = (text, x, y, extra = {}) => ({ text, x, y, w: text.length * 10, h: 14, fontSize: 14, charX: [...Array(text.length + 1).keys()].map(i => i * 10), secIdx: 0, paraIdx: 0, ...extra });

test('fixed spaces: nbsp, figure space and narrow nbsp get a V at the character centre; a normal space does not', () => {
  assert.ok([' ', ' ', ' '].every(c => FIXED_SPACE.test(c)));
  assert.equal(FIXED_SPACE.test(' '), false);
  const { spaces } = marksForRuns([run('1. 두 물체 A, B', 100, 50)]);
  assert.deepEqual(spaces.map(s => s.x), [125, 205]);
  assert.ok(spaces.every(s => s.y === 50 && s.h === 14));
});

test('hanging indent: only paragraphs with a second line, at the second line start', () => {
  const body = [run('ㄱ. 충돌 전후 물체의 운동량 변화를', 40, 100, { paraIdx: 1 }), run('비교할 수 있다.', 63.8, 122, { paraIdx: 1 }), run('ㄴ. 한 줄', 40, 150, { paraIdx: 2 })];
  const { indents } = marksForRuns(body);
  assert.equal(indents.length, 1, 'a one-line item gets no mark');
  assert.deepEqual(indents[0], { x: 63.8, top: 100, bottom: 136 });
});

test('a smaller bracket on the same line does not make a second line', () => {
  const { indents } = marksForRuns([run('〔', 30, 100, { h: 10 }), run('실험 과정', 42, 98), run('〕', 92, 100, { h: 10 })]);
  assert.equal(indents.length, 0);
});

test('centred lines are not a hanging indent', () => {
  const { indents } = marksForRuns([run('충돌 시간', 100, 100, { cellPath: [{ controlIndex: 0, cellIndex: 3, cellParaIndex: 0 }] }), run('(s)', 110, 122, { cellPath: [{ controlIndex: 0, cellIndex: 3, cellParaIndex: 0 }] })]);
  assert.equal(indents.length, 0);
});

test('two tables with the same cell number are not one paragraph', () => {
  const cell = [{ controlIndex: 0, cellIndex: 3, cellParaIndex: 0 }];
  const { indents } = marksForRuns([run('④ ㄱ', 180, 100, { cellPath: cell }), run('ㄱ, ㄷ', 240, 400, { cellPath: cell })]);
  assert.equal(indents.length, 0);
});

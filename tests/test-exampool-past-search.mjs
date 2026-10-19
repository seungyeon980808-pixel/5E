import test from 'node:test';
import assert from 'node:assert/strict';
import {MONTH,shortTitle,norm,splitWords,pastScore} from '../assets/exampool/sheet/past-search.js';
// 기출 목록 검색 순수 함수(리팩토링으로 card-editor.js에서 나옴) — 동작이 그대로인지 지킨다.
test('past search helpers keep the exam-library rules', () => {
  assert.equal(MONTH[11], '수능');
  assert.equal(shortTitle(2027, 6, '물리학Ⅱ', 2), '물리2 27년 6평 2번');
  assert.equal(shortTitle(2026, 11, '생명과학Ⅰ', 19), '생명1 26년 수능 19번');
  assert.equal(norm('ＡＢ c'), 'ab c');
  assert.deepEqual(splitWords(' 자석,질량 #운동량 '), ['자석', '질량', '운동량']);
  const item = { title: '2027학년도 6월 모평 물리학Ⅱ 2번', short: '물리2 27년 6평 2번', tags: ['행성운동'], text: '위성이 행성의 중력에 의해' };
  assert.equal(pastScore(item, ['행성운동']), 5);
  assert.equal(pastScore(item, ['물리2']), 8);
  assert.equal(pastScore(item, ['중력']), 1);
});

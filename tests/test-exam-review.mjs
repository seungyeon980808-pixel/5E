// 시험지 출제 점검·요약(10-22): 정답 분포, 빠진 정답·배점, 같은 정답 연속, 선지 겹침, 배점 합계, 이원목적분류표·정답표, 나형 순서.
import test from 'node:test';
import assert from 'node:assert/strict';
import { examStats, examChecks, blueprintRows, answerRows, shuffledOrder } from '../assets/exampool/sheet/exam-review.js';
const q = (i, extra = {}) => ({ id: 'q' + i, type: '합답형', ask: '옳은 것은?', points: 5, answer: i % 5, unitLarge: '역학', standardCode: '[12물리01-01]', choices: [{ text: 'ㄱ' }, { text: 'ㄴ' }], ...extra });

test('stats: answer distribution, points, units and standards', () => {
  const s = examStats([q(0), q(1), q(2, { answer: 0 }), q(3, { type: '서술형', answer: null })]);
  assert.deepEqual(s.answers, [2, 1, 0, 0, 0]); assert.equal(s.points, 20); assert.deepEqual(s.units, [['역학', 4]]);
});

test('checks: missing answer/points/ask, duplicate choices, three same answers in a row, total not 100', () => {
  const qs = [q(1, { answer: 2 }), q(2, { answer: 2 }), q(3, { answer: 2 }), q(4, { answer: null }), q(5, { points: 0 }), q(6, { ask: ' ' }), q(7, { choices: [{ text: 'ㄱ, ㄴ' }, { text: 'ㄱ,ㄴ' }] })];
  const text = examChecks(qs, { ready: x => x.id !== 'q1' }).map(c => c.text);
  for (const re of [/정답을 정하지 않은 문항: 4번/, /배점이 없는 문항: 5번/, /발문이 비어 있는 문항: 6번/, /선지 글이 겹치는 문항: 7번/, /정답 ③이 3번 이어짐: 1번, 2번, 3번/, /배점 합계 30점/]) assert.ok(text.some(t => re.test(t)), re.source);
  // 조판은 자동 저장(10-23)이라 「조판 저장 전」 점검은 나오지 않는다.
  assert.ok(!text.some(t => /조판을 저장하지 않은/.test(t)));
  assert.deepEqual(examChecks([]), []);
});

test('blueprint and answer sheets; the B-form order is shuffled, stable and a permutation', () => {
  const qs = [q(0), q(1, { type: '서술형', answer: null })];
  assert.deepEqual(blueprintRows(qs)[1], [1, '합답형', '역학', '', '', '[12물리01-01]', 5, '①']);
  assert.deepEqual(answerRows(qs)[2], [2, '서술형', 5]);
  const ids = Array.from({ length: 20 }, (_, i) => 'q' + i), a = shuffledOrder(ids, 42), b = shuffledOrder(ids, 42);
  assert.deepEqual(a, b); assert.notDeepEqual(a, ids); assert.deepEqual([...a].sort(), [...ids].sort());
  assert.notDeepEqual(shuffledOrder(['x', 'y'], 1), ['x', 'y'], 'two questions always swap');
});

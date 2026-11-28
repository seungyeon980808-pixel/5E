// 11-20 「시험지 통째로 변환」: PDF 이름으로 평가원·학평 시험지인지와 5E_exam 시험 이름을 정한다(5E_exam 기출 제목에서 번호를 뺀 것과 같게).
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeExamOf, wholeEstimateSeconds } from '../js/unified-library-ui.js';

test('평가원·학평 시험지 PDF 이름 → 시험 이름', () => {
  assert.deepEqual({ ...wholeExamOf('p1_2026_11.pdf') }, { code: 'p1_2026_11', subject: 'p1', kice: true, title: '2026학년도 수능 물리학Ⅰ' });
  assert.equal(wholeExamOf('5e.shared.drive/기출문제/화학2/c2_2025_06.pdf').title, '2025학년도 6월 모평 화학Ⅱ');
  assert.equal(wholeExamOf('e1_2024_09').title, '2024학년도 9월 모평 지구과학Ⅰ');
  const hak = wholeExamOf('5e.hakpyeong/물리1/문제/p1_2026_10.pdf');
  assert.equal(hak.kice, false);
  assert.equal(hak.title, '2026학년도 10월 학평 물리학Ⅰ');
});

test('시험지가 아니면 null(교과서·모르는 달·과목)', () => {
  for (const name of ['교과서_중2', 'p1_2026_12.pdf', 'x1_2026_11.pdf', 'p1_2026_11_03.pdf', '', null]) assert.equal(wholeExamOf(name), null, String(name));
});

test('확인 줄의 예상 시간', () => {
  assert.equal(wholeEstimateSeconds(20, true), 10);
  assert.equal(wholeEstimateSeconds(20, false), 4);
  assert.equal(wholeEstimateSeconds(1, true), 3);
});

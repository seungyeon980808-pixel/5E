// 그래프 라벨 위첨자: 10^14처럼 중괄호 없이 쓴 숫자 묶음은 한꺼번에 올린다(넘겨받은 알려진 문제 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {graphMathNodes} from '../js/render/graph-label.js';
const sup=s=>graphMathNodes(s).find(n=>n.kind==='scripts')?.sup?.map(n=>n.text).join('');
test('중괄호 없는 숫자 지수는 전체가 위첨자',()=>{
  assert.equal(sup('10^14'),'14');assert.equal(sup('10^{14}'),'14');assert.equal(sup('s^-1'),'−1');assert.equal(sup('m/s^2'),'2');
  const nodes=graphMathNodes('x^2y');assert.equal(nodes.length,2,'문자 지수는 TeX처럼 한 글자');
});

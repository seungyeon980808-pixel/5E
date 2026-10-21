// 과학 글 첨자 자동(js/rhwp-exam-science-text.js): 어디에 아래·위 첨자를 입힐지 글만 보고 찾는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptRanges } from '../js/rhwp-exam-science-text.js';

const show = text => { const marks = [...text].map(c => c); for (const r of scriptRanges(text)) for (let i = r.start; i < r.end; i++) marks[i] = (r.kind === 'sub' ? '_' : '^') + text[i]; return marks.join(''); };

test('chemical formulas, ions, units and physics labels get scripts', () => {
  assert.equal(show('H2O'), 'H_2O');
  assert.equal(show('2H2 + O2 → 2H2O'), '2H_2 + O_2 → 2H_2O');
  assert.equal(show('Ca(OH)2와 CaCO3'), 'Ca(OH)_2와 CaCO_3');
  assert.equal(show('Fe3+ 이온과 Na+, Cl-'), 'Fe^3^+ 이온과 Na^+, Cl^-');
  assert.equal(show('NH4+ 와 SO42-, CO32-, OH-'), 'NH_4^+ 와 SO_4^2^-, CO_3^2^-, OH^-');
  assert.equal(show('(NH4)2SO4'), '(NH_4)_2SO_4');
  assert.equal(show('가속도는 2 m/s2, 넓이 10 cm2, 3 s-1'), '가속도는 2 m/s^2, 넓이 10 cm^2, 3 s^-^1');
  assert.equal(show('스위치 S1을 닫고 V2를 읽는다'), '스위치 S_1을 닫고 V_2를 읽는다');
});

test('ordinary words, Korean labels, question numbers and mass labels stay plain', () => {
  for (const text of ['1. 다음 중 옳은 것은? [3점]', 'Hello World', 'A4 용지', 'm1과 m2의 질량', '(가)와 (나)', 'CO와 NO', 'DNA 2개', 'ㄱ, ㄴ, ㄷ', 'pH 7'])
    assert.deepEqual(scriptRanges(text), [], text);
});

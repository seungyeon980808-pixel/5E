// 한글 수식 ↔ LaTeX 변환기 검사(11-13). 물리·화학·생명·지구·수학에서 자주 쓰는 식.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hwpToLatex, latexToHwp, detectSyntax, toLatex } from '../js/eq/hwp-latex.js';

const H = [
  ['5 over 3', '\\frac{5}{3}'],
  ['E_k = 1 over 2 mv^2', 'E_{k}=\\frac{1}{2}mv^{2}'],
  ['x= {-b +- sqrt {b^2 -4ac}} over {2a}', 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'],
  ['F=k {q_1 q_2} over {r^2}', 'F=k\\frac{q_{1}q_{2}}{r^{2}}'],
  ['root 3 of 8', '\\sqrt[3]{8}'],
  ['rm {bar AB}', '\\mathrm{\\overline{AB}}'],
  ['vec F = m vec a', '\\vec{F}=m\\vec{a}'],
  ['Delta x = v_0 t', '\\Delta x=v_{0}t'],
  ['2H_2 + O_2 -> 2H_2 O', '2H_{2}+O_{2}\\rightarrow 2H_{2}O'],
  ['sum _{k=1} ^{n} k', '\\sum_{k=1}^{n}k'],
  ['int _{0} ^{1} x^2 dx', '\\int_{0}^{1}x^{2}dx'],
  ['lim _{x -> 0} {sin x} over x', '\\lim_{x\\rightarrow 0}\\frac{\\sin x}{x}'],
  ['LEFT ( a over b RIGHT )', '\\left(\\frac{a}{b}\\right)'],
  ['x^2 -4x+3 LEQ 0', 'x^{2}-4x+3\\le 0'],
  ['{rm N} cdot {rm m}', '{\\mathrm{N}}\\cdot{\\mathrm{m}}'],
  ['alpha + beta = pi', '\\alpha+\\beta=\\pi'],
  ['pmatrix{1 & 2 # 3 & 4}', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'],
  ['f(x) = cases{x & (x GEQ 0) # -x & (x<0)}', 'f(x)=\\begin{cases}x&(x\\ge 0)\\\\-x&(x<0)\\end{cases}'],
  ['30 deg', '30^{\\circ}'],
  ['T = 2 pi sqrt {l over g}', 'T=2\\pi\\sqrt{\\frac{l}{g}}'],
  ['"속력" = s over t', '\\text{속력}=\\frac{s}{t}'],
  ['PV=nRT', 'PV=nRT'],
  ['a~b', 'a\\ b'],
  ['therefore x approx 3', '\\therefore x\\approx 3'],
  ['log _{2} 8 = 3', '\\log_{2}8=3'],
];
test('한글 수식 → LaTeX', () => { const bad = H.filter(([h, l]) => hwpToLatex(h) !== l).map(([h, l]) => `${h} → ${hwpToLatex(h)} (기대 ${l})`); assert.deepEqual(bad, []); });

const L = [
  ['\\frac{5}{3}', '{5} over {3}'],
  ['x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', 'x={-b +- sqrt {b^2-4ac}} over {2a}'],
  ['\\sqrt[3]{8}', 'root {3} of {8}'],
  ['\\vec{F}=m\\vec{a}', 'vec F=m vec a'],
  ['E_k=\\frac{1}{2}mv^2', 'E_k={1} over {2}mv^2'],
  ['\\left(\\frac{a}{b}\\right)', 'LEFT ( {a} over {b} RIGHT )'],
  ['x^2-4x+3\\le 0', 'x^2-4x+3 LEQ 0'],
  ['\\mathrm{N\\cdot m}', 'rm {N cdot m}'],
  ['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 'pmatrix{1 & 2 # 3 & 4}'],
  ['\\int_0^1 x^2\\,dx', 'int_0^1 x^2`dx'],
  ['\\text{속력}=\\frac{s}{t}', '"속력"={s} over {t}'],
];
const norm = x => x.replace(/\s*([=+\-^_{}()<>,`])\s*/g, '$1').replace(/\s+/g, ' ').trim();
test('LaTeX → 한글 수식', () => { const bad = L.filter(([l, h]) => norm(latexToHwp(l)) !== norm(h)).map(([l, h]) => `${l} → ${latexToHwp(l)} (기대 ${h})`); assert.deepEqual(bad, []); });

test('왕복: 한글 → LaTeX → 한글 → LaTeX가 같은 LaTeX', () => {
  const bad = H.map(([h]) => [h, hwpToLatex(h), hwpToLatex(latexToHwp(hwpToLatex(h)))]).filter(([, a, b]) => a.replace(/[{}\s]/g, '') !== b.replace(/[{}\s]/g, '')); assert.deepEqual(bad, []);
});

test('쓰는 법 알아보기', () => {
  assert.equal(detectSyntax('1 over 2'), 'hwp');
  assert.equal(detectSyntax('\\frac{1}{2}'), 'latex');
  assert.equal(detectSyntax('E_p = mgh'), 'same');
  assert.equal(toLatex('E_p = mgh'), 'E_p = mgh');
  assert.equal(toLatex('a over b'), '\\frac{a}{b}');
});

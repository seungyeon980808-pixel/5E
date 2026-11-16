// B10(1.7.1): 5E_image 글 상자 수식에서 한글(HWP) 수식 말이 일부만 바뀌던 것.
// LEQ·GEQ·NEQ·root·sqrt·approx·inf와 <= >= != 글자 기호도 수식 기호로 바꾼다. 원래 되던 말은 그대로.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// text-editor.js는 DOM을 쓰므로 함수 원문만 잘라 읽는다(ai-label-canvas-edit.test.cjs와 같은 방식).
function loadNormalize() {
  const file = process.env.BL4_TEXT_EDITOR || path.join(__dirname, '../js/text-editor.js');
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function normalizeFormulaSource(');
  const end = source.indexOf('\nfunction looksLikeFormula(', start);
  assert.ok(start >= 0 && end > start, 'normalizeFormulaSource를 찾지 못함');
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end) + '\nthis.normalizeFormulaSource = normalizeFormulaSource;', context);
  return context.normalizeFormulaSource;
}

test('한글 수식 말 → 수식 기호', () => {
  const n = loadNormalize();
  const cases = [
    // 새로 받는 말
    ['a LEQ b', 'a ≤ b'], ['a GEQ b', 'a ≥ b'], ['a NEQ b', 'a ≠ b'], ['x leq 1', 'x ≤ 1'],
    ['a <= b', 'a ≤ b'], ['a >= b', 'a ≥ b'], ['a != b', 'a ≠ b'],
    ['A <=> B', 'A ⇔ B'], ['A => B', 'A ⇒ B'], ['A <-> B', 'A ↔ B'],
    ['g approx 9.8', 'g ≈ 9.8'], ['t -> inf', 't → ∞'],
    ['root 2 of x', 'sqrt{x}'], ['root {2} of {gh}', 'sqrt{gh}'],
    ['v = sqrt 2gh', 'v = sqrt{2gh}'], ['v = sqrt {2gh}', 'v = sqrt{2gh}'], ['SQRT{x}', 'sqrt{x}'],
    ['3 TIMES 4', '3 × 4'], ['30 DEG', '30 °'],
    // 원래 되던 말(바뀌면 안 됨)
    ['sin theta', '\\sin θ'], ['a over b', 'frac{a}{b}'], ['{a} over {b}', 'frac{a}{b}'],
    ['x +- 1', 'x ± 1'], ['A -> B', 'A → B'], ['a - b', 'a − b'], ['x^2', 'x^{2}'],
    ['T = 2pi sqrt{frac{l}{g}}', 'T = 2pi sqrt{frac{l}{g}}'], ['roman2', 'Ⅱ'],
    ['\\sqrt{x}', '\\sqrt{x}'], ['information', 'information'], ['mgh', 'mgh'],
  ];
  const wrong = cases.map(([src, want]) => [src, want, n(src)]).filter(([, want, got]) => want !== got);
  assert.deepEqual(wrong, []);
});

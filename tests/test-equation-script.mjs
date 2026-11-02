import test from 'node:test';
import assert from 'node:assert/strict';
import {tidyEquationScript,joinTildeEquations,needsTail,tailOf} from '../assets/exampool/sheet/equation-script.js';
import {liftTallEquations} from '../assets/exampool/sheet/typeset-model.js';

test('아래·위첨자를 같이 쓴 수식은 위첨자를 앞 묶음에 붙인다(겹침 방지)', () => {
  assert.equal(tidyEquationScript('NO_{3}^{-}'), 'N{O_{3}}^{-}');
  assert.equal(tidyEquationScript('X^{2-}_{1}'), '{X_{1}}^{2-}');
  assert.equal(tidyEquationScript('\\sqrt{x}_{1}^{2}'), '{\\sqrt{x}_{1}}^{2}');
  assert.equal(tidyEquationScript('\\mathrm{Na}_{2}^{+}'), '{\\mathrm{Na}_{2}}^{+}');
});

test('첨자 묶기는 한계 첨자·질량수·명령 인자·집합 괄호를 건드리지 않는다', () => {
  for (const s of ['\\sum_{i=1}^{n}a_{i}', '{}^{14}_{6}C', '\\frac{x}{y}_{a}^{b}', '\\{a\\}_{1}^{2}', '(a)_{1}^{2}', 'H_{2}O'])
    assert.equal(tidyEquationScript(s), s, s);
});

test('한글이 든 분수만 막대 위아래를 ¼ 빈칸 첨자로 띄운다', () => {
  assert.equal(tidyEquationScript('\\frac{p\\text{전자 수}}{\\text{홀전자 수}}'), '\\frac{p\\text{전자`수}_{`}}{{}^{`}\\text{홀전자`수}}');
  assert.equal(tidyEquationScript('\\frac{1}{4}'), '\\frac{1}{4}');
});

test('W·V 뒤 한글은 꼬리 빈칸 둘, 나머지는 하나', () => {
  assert.equal(tailOf('W', '와'), '``');
  assert.equal(tailOf('m', '이다'), '`');
  assert.equal(tailOf('x', '='), '');
});

test('수식 안 글 빈칸은 ¼ 빈칸, 화살표 양옆은 수식 빈칸으로 넣고 두 번 해도 같다', () => {
  const once = tidyEquationScript('\\frac{\\text{들어 있는 수}}{a}+cH^{+}→aX');
  assert.equal(once, '\\frac{\\text{들어`있는`수}_{`}}{a}+cH^{+}~→~aX');
  assert.equal(tidyEquationScript(once), once);
});

test('수식 사이 물결은 수식 하나로 합친다(셋 이상도)', () => {
  assert.equal(joinTildeEquations('$a$($a$∼$d$는 반응 계수)'), '$a$($a \\sim d$는 반응 계수)');
  assert.equal(joinTildeEquations('$x$～$y$∼$z$는'), '$x \\sim y \\sim z$는');
});

test('기울어진 글자로 끝나는 수식 바로 뒤 한글에만 꼬리 빈칸', () => {
  assert.equal(needsTail('m', '이다.'), true);
  assert.equal(needsTail('H_{2}', '의'), false);
  assert.equal(needsTail('x', '='), false);
  assert.equal(needsTail('2m', '인'), true);
  assert.equal(needsTail('100mL', '에서'), false);
});

test('키 큰 수식 줄은 내려간 만큼 줄 높이를 줄이고 그만큼 줄 사이를 늘린다(다음 줄 자리 그대로)', () => {
  const xml = '<hp:p id="0"><hp:run><hp:equation baseUnit="990"><hp:script>\\frac{1}{3}</hp:script><hp:sz height="2435"/></hp:equation></hp:run>'
    + '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="2435" textheight="2435" baseline="2070" spacing="552"/></hp:linesegarray></hp:p>';
  const out = liftTallEquations(xml, () => 7.9 * 75);
  const seg = out.match(/<hp:lineseg [^>]*>/)[0], num = k => Number(seg.match(new RegExp(`${k}="(\\d+)"`))[1]);
  assert.equal(num('vertsize'), 2435 - Math.round(7.9 * 75 / 0.85));
  assert.equal(num('vertsize') + num('spacing'), 2435 + 552);
  assert.equal(liftTallEquations(out, () => 7.9 * 75), out);
});

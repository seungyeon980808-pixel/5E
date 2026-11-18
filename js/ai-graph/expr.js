// 그림으로 만드는 그래프(1.8.0 옵션 엔진)의 곡선 식 계산기. eval·Function을 쓰지 않는다.
// image_generator(graphdraw)는 식을 JS로 바꿔 Function으로 계산했다. 같은 뜻을 지키려고
//   · log = 자연로그(Math.log) — 5E 기본 그래프 해석기(js/function-graph/parser.js)의 log(상용로그)와 다르다.
//   · min·max·pow(두 인자), PI·pi·e, ^ 와 ** 둘 다 거듭제곱, 숫자 바로 뒤 이름·괄호는 곱하기(2x, 3(x+1)).
//   · 「Math.」 접두는 무시한다.
// compileExpr(문자열) → (x) => 숫자. 해석할 수 없는 식이면 오류를 던진다(호출한 쪽이 그 곡선만 건너뜀).

const FN1 = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const FN2 = { min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2 };
const CONST = { pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E };

function tokenize(src) {
  const s = String(src ?? '').replace(/Math\./g, '').replace(/\*\*/g, '^').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`식에 쓸 수 없는 글자: ${c}`);
  }
  // 숫자·닫는 괄호 뒤에 이름·여는 괄호·숫자가 바로 오면 곱하기를 끼운다(2x, 3(x+1), (x+1)(x-1)).
  const withMul = [];
  for (let k = 0; k < out.length; k++) {
    const a = withMul.at(-1), b = out[k];
    if (a && (a.t === 'n' || a.t === ')') && (b.t === 'id' || b.t === '(' || (b.t === 'n' && a.t === ')'))) withMul.push({ t: '*' });
    withMul.push(b);
  }
  return withMul;
}

// 재귀 하강: expr = term (('+'|'-') term)* ; term = unary (('*'|'/') unary)* ; unary = ('-'|'+') unary | power ;
// power = atom ('^' unary)? (오른쪽 결합, -x^2 = -(x^2)) ; atom = n | x | 상수 | 함수(인자) | ( expr )
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const take = (t) => { const k = tokens[i]; if (!k || (t && k.t !== t)) throw new Error(`식 해석 실패: ${t || '값'}이 필요합니다.`); i++; return k; };
  function expr() {
    let node = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) { const op = take().t; const r = term(); const l = node; node = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x); }
    return node;
  }
  function term() {
    let node = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) { const op = take().t; const r = unary(); const l = node; node = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x); }
    return node;
  }
  function unary() {
    if (peek() && peek().t === '-') { take(); const v = unary(); return (x) => -v(x); }
    if (peek() && peek().t === '+') { take(); return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() && peek().t === '^') { take(); const ex = unary(); return (x) => Math.pow(base(x), ex(x)); }
    return base;
  }
  function args() {
    take('(');
    const list = [expr()];
    while (peek() && peek().t === ',') { take(','); list.push(expr()); }
    take(')');
    return list;
  }
  function atom() {
    const k = peek();
    if (!k) throw new Error('식이 끝났습니다.');
    if (k.t === 'n') { take(); const v = k.v; return () => v; }
    if (k.t === '(') { take('('); const v = expr(); take(')'); return v; }
    if (k.t === 'id') {
      take();
      const name = k.v;
      if (name === 'x') return (x) => x;
      if (FN1[name] || FN2[name]) {
        const a = args();
        if (FN1[name]) { if (a.length !== 1) throw new Error(`${name}에는 값 하나가 필요합니다.`); const f = FN1[name], u = a[0]; return (x) => f(u(x)); }
        if (a.length !== 2) throw new Error(`${name}에는 값 두 개가 필요합니다.`);
        const f = FN2[name], [u, v] = a; return (x) => f(u(x), v(x));
      }
      if (Object.prototype.hasOwnProperty.call(CONST, name)) { const v = CONST[name]; return () => v; }
      throw new Error(`모르는 이름: ${name}`);
    }
    throw new Error(`식 해석 실패: ${k.t}`);
  }
  const fn = expr();
  if (i !== tokens.length) throw new Error('식 뒤에 남은 글자가 있습니다.');
  return fn;
}

const cache = new Map();
export function compileExpr(src) {
  const key = String(src ?? '');
  if (cache.has(key)) return cache.get(key);
  const fn = parse(tokenize(key));
  if (cache.size > 500) cache.clear();
  cache.set(key, fn);
  return fn;
}

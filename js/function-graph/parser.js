/* ===== FUNCTION-GRAPH / PARSER: eval-free expression compiler ===== */
//
// A tiny tokenizer + recursive-descent parser that turns a math expression
// string into a reusable evaluator: compile("sin(x)") → fn(x): number.
//
// Design (기획서 결정 D):
//   * NO eval / Function() — a hand-written parser keeps the "no-build, vanilla"
//     rule and avoids the security/stability cost of eval on user input.
//   * Whitelist only: numbers, the variable `x`, operators + - * / ^, unary ±,
//     parentheses, the functions/constants listed below. Anything else throws a
//     descriptive Error at COMPILE time (the modal shows it), so a typo never
//     silently mis-evaluates.
//   * Angles are RADIANS (기획서 §12-1). degree toggle is an extension.
//   * EVAL never throws: out-of-domain inputs (log(-1), sqrt(-1), asin(2), tan
//     near π/2, /0) yield NaN/±Infinity via the underlying Math fns — the sampler
//     drops those points. So compile() = "is this a valid formula?", and the
//     returned fn = "evaluate, giving NaN where undefined".
//
// This module is PURE: no imports, no DOM, no module state — unit-test friendly.

/* ----- allowed single-argument functions (name → Math impl, radians) ----- */
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  log: (v) => Math.log10(v),   // log = 상용로그(base 10)
  ln: Math.log,                // ln  = 자연로그(base e)
  exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign,
};

/* ----- allowed constants ----- */
const CONSTS = { pi: Math.PI, e: Math.E };

/* ===== TOKENIZER ===== */
// number | ident(함수·상수·변수) | one of + - * / ^ ( ) ; whitespace skipped.
function tokenize(str) {
  const tokens = [];
  const s = String(str);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    // number: digits with an optional single decimal point (1, 3.5, .5)
    if ((c >= "0" && c <= "9") || (c === "." && s[i + 1] >= "0" && s[i + 1] <= "9")) {
      let j = i, seenDot = false;
      while (j < s.length) {
        const d = s[j];
        if (d >= "0" && d <= "9") { j++; continue; }
        if (d === ".") {
          // 두 번째 소수점("1.2.3" 같은 오타)은 암묵 곱(1.2*0.3)으로 조용히 넘어가지 않고
          // 여기서 즉시 에러 — 오타를 유효한 식으로 오인하는 걸 막는다.
          if (seenDot) throw new Error(`잘못된 숫자: "${s.slice(i, j + 1)}"`);
          seenDot = true; j++; continue;
        }
        break;
      }
      tokens.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }
    // identifier: a run of ASCII letters (function name, constant, or x)
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      tokens.push({ t: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^()".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`알 수 없는 문자: "${c}"`);
  }
  return tokens;
}

/* ===== PARSER (recursive descent) =====
 * Precedence (low→high): + − | * / | unary ± | ^ (right-assoc) | primary.
 * Structured so −x^2 = −(x^2) and 2^−1 / 2^3^2(=2^9) parse the usual math way.
 * Produces an AST of plain nodes; evalNode walks it at run time. */
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const eat = (v) => {
    const tk = tokens[pos];
    if (!tk || tk.v !== v) throw new Error(`"${v}" 가 필요합니다`);
    pos++;
  };

  function parseExpr() {          // + and −
    let node = parseTerm();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      node = { t: "bin", op, a: node, b: parseTerm() };
    }
    return node;
  }
  function parseTerm() {          // * and /
    let node = parseUnary();
    while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = next().v;
      node = { t: "bin", op, a: node, b: parseUnary() };
    }
    return node;
  }
  function parseUnary() {         // leading + / −
    if (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      return { t: "unary", op, a: parseUnary() };
    }
    return parsePower();
  }
  function parsePower() {         // ^ (right-assoc; exponent may be unary: 2^-1)
    const base = parsePrimary();
    if (peek() && peek().t === "op" && peek().v === "^") {
      next();
      return { t: "bin", op: "^", a: base, b: parseUnary() };
    }
    return base;
  }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error("수식이 끝났습니다");
    if (tk.t === "num") { next(); return { t: "num", v: tk.v }; }
    if (tk.t === "op" && tk.v === "(") {
      next();
      const inner = parseExpr();
      eat(")");
      return inner;
    }
    if (tk.t === "id") {
      next();
      if (tk.v === "x") return { t: "var" };
      if (Object.prototype.hasOwnProperty.call(CONSTS, tk.v)) return { t: "const", v: CONSTS[tk.v] };
      if (Object.prototype.hasOwnProperty.call(FUNCS, tk.v)) {
        eat("(");
        const arg = parseExpr();
        eat(")");
        return { t: "call", fn: tk.v, a: arg };
      }
      throw new Error(`알 수 없는 이름: "${tk.v}"`);
    }
    throw new Error(`예상치 못한 토큰: "${tk.v}"`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) throw new Error(`남은 토큰: "${tokens[pos].v}"`);
  return ast;
}

/* ===== EVALUATOR (never throws — non-finite = out of domain) ===== */
function evalNode(node, x) {
  switch (node.t) {
    case "num": return node.v;
    case "const": return node.v;
    case "var": return x;
    case "unary": {
      const v = evalNode(node.a, x);
      return node.op === "-" ? -v : v;
    }
    case "bin": {
      const a = evalNode(node.a, x), b = evalNode(node.b, x);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "^": return Math.pow(a, b);
      }
      return NaN;
    }
    case "call": return FUNCS[node.fn](evalNode(node.a, x));
    default: return NaN;
  }
}

/* ===== IMPLICIT MULTIPLICATION =====
 * Insert a `*` between a value-ENDER and a value-STARTER so casual notation works:
 *   sin(5x) → sin(5*x),  2(x+1) → 2*(x+1),  5x^2 → 5*x^2,  5sin(x) → 5*sin(x),
 *   x(x-1) → x*(x-1),  (x+1)(x-1) → (x+1)*(x-1).
 * A function NAME is NOT a value-ender (it must be followed by `(`), so `sin(`
 * stays a call, never `sin*(`. Functions still REQUIRE parentheses — write
 * sin(5x), not sin5x (that stays a clear error rather than a silent wrong guess). */
function isValueEnder(tk) {
  if (!tk) return false;
  if (tk.t === "num") return true;
  if (tk.t === "op" && tk.v === ")") return true;
  // a variable(x) or constant(pi/e) ends a value; a function name does NOT.
  if (tk.t === "id") return tk.v === "x" || Object.prototype.hasOwnProperty.call(CONSTS, tk.v);
  return false;
}
function isValueStarter(tk) {
  if (!tk) return false;
  if (tk.t === "num") return true;
  if (tk.t === "op" && tk.v === "(") return true;
  if (tk.t === "id") return true; // variable, constant, or function name all begin a value
  return false;
}
function insertImplicitMul(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    out.push(tokens[i]);
    if (isValueEnder(tokens[i]) && isValueStarter(tokens[i + 1])) {
      out.push({ t: "op", v: "*" });
    }
  }
  return out;
}

/* ===== PUBLIC: compile(expr) → fn(x) ===== */
// Throws on a syntax/whitelist error (caller shows the message). The returned
// evaluator is pure and reusable — parse once, sample many.
function compile(expr) {
  const ast = parse(insertImplicitMul(tokenize(expr)));
  return (x) => evalNode(ast, x);
}

// Convenience for the modal: true if the expression compiles, else the error msg.
function validateExpr(expr) {
  try { compile(expr); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}

export { compile, validateExpr, tokenize, parse, FUNCS, CONSTS };

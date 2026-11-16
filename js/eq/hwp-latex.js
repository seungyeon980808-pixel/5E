// 한글 수식(HancomEQN) ↔ LaTeX 변환기 (11-13, 5E 수식 입력)
// 공개 변환기(hwp-eqn-ts·unified-hwpeq)가 실제 수식(=, ±, root n of, cdot, 여러 글자 곱 mv 등)에서 틀려 직접 만든다.
// 프로그램 안 저장은 LaTeX 하나. 한글 수식은 치는 법·복사하는 법으로만 쓴다.
// 문법 요약(한글): a over b(분수) · sqrt x · root n of x · x^2 · x_1 · {묶음} · LEFT ( … RIGHT ) · rm/it/bold
//   · bar/vec/hat/dot/ddot/tilde/under · matrix/pmatrix/bmatrix/dmatrix{a & b # c & d} · cases{a & b # c & d}
//   · sum/int/prod/lim _ ^ · ~(빈칸) `(좁은 빈칸) · "글자" · +- -+ times cdot div LEQ GEQ != -> <-> => approx …

const GREEK = 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'.split(' ');
// 한글 낱말 → LaTeX (대소문자 그대로 먼저, 없으면 소문자로)
const H2L = {
  '+-': '\\pm', '-+': '\\mp', times: '\\times', cdot: '\\cdot', div: '\\div', circ: '\\circ', ast: '\\ast', oplus: '\\oplus', otimes: '\\otimes',
  '<=': '\\le', '>=': '\\ge', LEQ: '\\le', GEQ: '\\ge', leq: '\\le', geq: '\\ge', '!=': '\\ne', NEQ: '\\ne', neq: '\\ne', '==': '\\equiv', equiv: '\\equiv',
  '<<': '\\ll', '>>': '\\gg', approx: '\\approx', sim: '\\sim', simeq: '\\simeq', cong: '\\cong', propto: '\\propto', 'prop': '\\propto',
  '->': '\\rightarrow', '<-': '\\leftarrow', '<->': '\\leftrightarrow', '=>': '\\Rightarrow', '<=>': '\\Leftrightarrow', larrow: '\\leftarrow', rarrow: '\\rightarrow',
  LARROW: '\\Leftarrow', RARROW: '\\Rightarrow', lrarrow: '\\leftrightarrow', LRARROW: '\\Leftrightarrow', uparrow: '\\uparrow', downarrow: '\\downarrow',
  inf: '\\infty', INF: '\\infty', infty: '\\infty', partial: '\\partial', nabla: '\\nabla', prime: "'", deg: '^{\\circ}', DEG: '^{\\circ}',
  angle: '\\angle', perp: '\\perp', parallel: '\\parallel', therefore: '\\therefore', because: '\\because', triangle: '\\triangle', 'cdots': '\\cdots', 'ldots': '\\ldots', 'vdots': '\\vdots', 'ddots': '\\ddots',
  in: '\\in', notin: '\\notin', subset: '\\subset', supset: '\\supset', subseteq: '\\subseteq', supseteq: '\\supseteq', cup: '\\cup', cap: '\\cap', emptyset: '\\emptyset', smallsetminus: '\\setminus',
  forall: '\\forall', exist: '\\exists', exists: '\\exists', 'neg': '\\neg', wedge: '\\land', vee: '\\lor', hbar: '\\hbar', ell: '\\ell',
  sum: '\\sum', SUM: '\\sum', int: '\\int', INT: '\\int', dint: '\\iint', oint: '\\oint', prod: '\\prod', PROD: '\\prod', lim: '\\lim', Lim: '\\lim',
  sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc', log: '\\log', ln: '\\ln', exp: '\\exp', max: '\\max', min: '\\min', det: '\\det',
  arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
};
for (const g of GREEK) H2L[g] = '\\' + g;
const ACCENT = { bar: '\\overline', vec: '\\vec', hat: '\\hat', dot: '\\dot', ddot: '\\ddot', tilde: '\\tilde', under: '\\underline', dyad: '\\overrightarrow', acute: '\\acute', grave: '\\grave', check: '\\check', arch: '\\overset{\\frown}' };
const FONT = { rm: '\\mathrm', it: '\\mathit', bold: '\\mathbf', RM: '\\mathrm', IT: '\\mathit' };
const MATRIX = { matrix: 'matrix', pmatrix: 'pmatrix', bmatrix: 'bmatrix', dmatrix: 'vmatrix' };
const DELIM_H2L = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '||': '\\|', '<': '\\langle', '>': '\\rangle', '.': '.', 'lceil': '\\lceil', 'rceil': '\\rceil', 'lfloor': '\\lfloor', 'rfloor': '\\rfloor' };

// ── 한글 수식 → LaTeX ──
function tokHwp(s) {
  const out = []; let i = 0;
  const OPS = ['<=>', '<->', '+-', '-+', '<=', '>=', '!=', '==', '->', '<-', '=>', '<<', '>>'];
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { const j = s.indexOf('"', i + 1); out.push({ t: 'text', v: s.slice(i + 1, j < 0 ? s.length : j) }); i = j < 0 ? s.length : j + 1; continue; }
    const op = OPS.find(o => s.startsWith(o, i)); if (op) { out.push({ t: 'w', v: op }); i += op.length; continue; }
    if (/[A-Za-z]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++; out.push({ t: 'w', v: s.slice(i, j) }); i = j; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: 'n', v: s.slice(i, j) }); i = j; continue; }
    out.push({ t: 'c', v: c }); i++;
  }
  return out;
}
export function hwpToLatex(src) {
  const T = tokHwp(String(src || '')); let p = 0;
  const peek = () => T[p], next = () => T[p++], isW = (t, v) => t && t.t === 'w' && t.v === v;
  const isStop = (t, stops) => !t || (t.t === 'c' && stops.includes(t.v)) || (t.t === 'w' && stops.includes(t.v));
  const strip = x => x.replace(/^\{([\s\S]*)\}$/, (m, a) => balanced(a) ? a : m);
  function word(v) {
    if (H2L[v]) return H2L[v] + (/^\\[A-Za-z]+$/.test(H2L[v]) ? ' ' : '');
    const low = v.toLowerCase(); if (H2L[low] && GREEK.includes(low)) return H2L[low] + ' ';
    return v; // 여러 글자 곱(mv)·변수 그대로
  }
  function atom(stops) {
    const t = next(); if (!t) return '';
    if (t.t === 'c' && t.v === '{') { const e = expr(['}']); if (peek()?.v === '}') p++; return '{' + e + '}'; }
    if (t.t === 'text') return '\\text{' + t.v + '}';
    if (t.t === 'n') return t.v;
    if (t.t === 'c') {
      if (t.v === '~') return '\\ ';
      if (t.v === '`') return '\\,';
      if (t.v === '#') return '\\\\';
      if (t.v === '&') return '&';
      if (t.v === "'") return "'";
      return t.v;
    }
    const v = t.v;
    if (v === 'sqrt' || v === 'SQRT') return '\\sqrt{' + strip(arg(stops)) + '}';
    if (v === 'root' || v === 'ROOT') { const n = strip(arg(['of', 'OF'])); if (isW(peek(), 'of') || isW(peek(), 'OF')) p++; return '\\sqrt[' + n + ']{' + strip(arg(stops)) + '}'; }
    if (ACCENT[v]) { const a = strip(arg(stops)); return ACCENT[v] === '\\overset{\\frown}' ? '\\overset{\\frown}{' + a + '}' : ACCENT[v] + '{' + a + '}'; }
    if (FONT[v]) { const a = strip(arg(stops)); return FONT[v] + '{' + a + '}'; }
    if (v === 'LEFT' || v === 'left') { const d = delim(); const e = expr(['RIGHT', 'right']); if (isW(peek(), 'RIGHT') || isW(peek(), 'right')) p++; const d2 = delim(); return '\\left' + d + e + '\\right' + d2; }
    if (MATRIX[v] || v === 'cases' || v === 'CASES' || v === 'eqalign') {
      const env = MATRIX[v] || (v === 'eqalign' ? 'aligned' : 'cases');
      if (peek()?.v !== '{') return v; p++; const e = expr(['}']); if (peek()?.v === '}') p++;
      return '\\begin{' + env + '}' + e + '\\end{' + env + '}';
    }
    if (v === 'sup' || v === 'SUP') return '^';
    if (v === 'sub' || v === 'SUB') return '_';
    return word(v);
  }
  function delim() { const t = next(); if (!t) return '.'; const v = t.v; return DELIM_H2L[v] ?? (t.t === 'w' && H2L[v] ? H2L[v] : v); }
  function arg(stops) { return scripts(atom(stops), stops); }
  function scripts(base, stops) {
    for (;;) {
      const t = peek();
      if (t && t.t === 'c' && (t.v === '^' || t.v === '_')) { p++; base += t.v + '{' + strip(atom(stops)) + '}'; continue; }
      if (t && t.t === 'w' && /^(sup|SUP|sub|SUB|to|from)$/.test(t.v)) { p++; base += (/^(sup|SUP|to)$/.test(t.v) ? '^' : '_') + '{' + strip(atom(stops)) + '}'; continue; }
      return base;
    }
  }
  function expr(stops = []) {
    const items = [];
    while (p < T.length && !isStop(peek(), stops)) {
      const t = peek();
      if (isW(t, 'over') || isW(t, 'OVER') || isW(t, 'atop')) {
        const kind = t.v.toLowerCase() === 'atop' ? 'binom' : 'frac'; p++;
        const num = items.pop() ?? '';
        const den = arg(stops);
        items.push((kind === 'frac' ? '\\frac{' : '\\genfrac{}{}{0pt}{}{') + strip(num) + '}{' + strip(den) + '}');
        continue;
      }
      items.push(arg(stops));
    }
    return join(items);
  }
  const out = expr([]);
  return tidy(out);
}
// 낱말 사이 띄어쓰기: 명령 뒤 글자가 이어지면 한 칸, 그 밖은 붙임
function join(items) {
  let s = '';
  for (const it of items) { if (!it) continue; if (s && /\\[A-Za-z]+$/.test(s) && /^[A-Za-z]/.test(it)) s += ' '; s += it; }
  return s;
}
function tidy(s) { return s.replace(/(\\[A-Za-z]+) (?=[^A-Za-z0-9])/g, '$1').replace(/\s+/g, ' ').replace(/ ([}^_])/g, '$1').replace(/\{ /g, '{').trim(); }
function balanced(s) { let d = 0; for (const c of s) { if (c === '{') d++; else if (c === '}') { d--; if (d < 0) return false; } } return d === 0; }

// ── LaTeX → 한글 수식 ──
const L2H = {}; for (const [k, v] of Object.entries(H2L)) { if (/^\\[A-Za-z]+$/.test(v) && !(v.slice(1) in L2H)) L2H[v.slice(1)] = /^[A-Za-z]+$/.test(k) ? k : k; }
Object.assign(L2H, { le: 'LEQ', leq: 'LEQ', ge: 'GEQ', geq: 'GEQ', ne: '!=', neq: '!=', to: '->', rightarrow: '->', leftarrow: '<-', leftrightarrow: '<->', Rightarrow: '=>', Leftrightarrow: '<=>', Leftarrow: 'LARROW', infty: 'inf', pm: '+-', mp: '-+', exists: 'exist', land: 'wedge', lor: 'vee', setminus: 'smallsetminus', iint: 'dint', longrightarrow: '->', rightleftharpoons: 'rlarrow', cdot: 'cdot', times: 'times', div: 'div', square: '□', quad: '~~', qquad: '~~~~', dots: 'cdots', ldots: 'ldots', cdots: 'cdots' });
for (const g of GREEK) L2H[g] = g;
const ACC_L2H = Object.fromEntries(Object.entries(ACCENT).map(([k, v]) => [v.slice(1), k])); ACC_L2H.bar = 'bar'; ACC_L2H.widehat = 'hat'; ACC_L2H.overrightarrow = 'dyad';
const FONT_L2H = { mathrm: 'rm', mathit: 'it', mathbf: 'bold', textbf: 'bold', operatorname: 'rm', mathsf: 'rm' };
const ENV_L2H = { matrix: 'matrix', pmatrix: 'pmatrix', bmatrix: 'bmatrix', vmatrix: 'dmatrix', Vmatrix: 'dmatrix', cases: 'cases', aligned: 'eqalign', align: 'eqalign', 'align*': 'eqalign' };
const DELIM_L2H = { '\\{': '{', '\\}': '}', '\\langle': '<', '\\rangle': '>', '\\|': '||', '\\lfloor': 'lfloor', '\\rfloor': 'rfloor', '\\lceil': 'lceil', '\\rceil': 'rceil' };
// o.hancom: 한글 파일로 내보낼 때(11-16, 1.7.1 B2). 글꼴 명령은 {rm X}처럼 묶어 뒤 글자로 번지지 않게 하고,
// 모양 없는 LaTeX 명령(\displaystyle 등)은 빼며, 모르는 명령은 o.unknown(Set)에 모은다. o 없이 부르면 예전과 같다.
const DROP_L2H = new Set(['displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'mathstrut', 'strut', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr']);
// 한컴 수식 명령 목록(한글문서파일형식_수식 revision1.3)에 없는 기호는 글자 그대로 넣는다(한글은 수식 안 유니코드 글자를 그린다).
const UNI_L2H = { rightleftharpoons: '⇌', leftrightharpoons: '⇋', mid: '|', degree: '°', AA: 'Å', cdotp: '·', checkmark: '✓', nexists: '∄', varnothing: '∅', parallel: '∥', perp: '⊥', ni: '∋', nleq: '≰', ngeq: '≱', leqslant: '≤', geqslant: '≥', lesssim: '≲', gtrsim: '≳', models: '⊨', dagger: '†', ddagger: '‡', hbar: 'ħ', nabla: '∇', aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', wp: '℘', implies: '⟹', iff: '⟺', gets: '←', mapsto: '↦', longleftarrow: '⟵', longleftrightarrow: '⟷', Longrightarrow: '⟹', updownarrow: '↕' };
export function latexToHwp(src, o = null) {
  const s = String(src || ''); let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  function group() { ws(); if (s[i] === '{') { i++; const e = seq('}'); if (s[i] === '}') i++; return e; } return one(); }
  function opt() { ws(); if (s[i] !== '[') return null; let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && !--d) break; } const inner = s.slice(i + 1, j); i = j + 1; return latexToHwp(inner, o); }
  function cmd() { let j = i + 1; if (/[A-Za-z]/.test(s[j] || '')) { while (j < s.length && /[A-Za-z*]/.test(s[j])) j++; } else j++; const name = s.slice(i + 1, j); i = j; return name; }
  // 한글 파일용(o.hancom)은 숫자만·글자만일 때만 묶음을 뺀다 — 한글은 2a를 2와 a 두 항으로 읽어 x_2a의 a가 첨자에서 빠진다.
  const wrap = x => (o?.hancom ? /^([A-Za-z]+|[0-9.]+)$/ : /^[A-Za-z0-9]+$/).test(x) || /^\{.*\}$/.test(x) ? x : '{' + x + '}';
  function delim() { ws(); if (s[i] === '\\') { const n = cmd(); return DELIM_L2H['\\' + n] ?? n; } return s[i++] || '.'; }
  function one() {
    ws(); const c = s[i]; if (c === undefined) return '';
    if (c === '{') return '{' + group() + '}';
    if (c === '\\') {
      const n = cmd();
      if (n === 'frac' || n === 'dfrac' || n === 'tfrac' || n === 'cfrac') { const a = group(), b = group(); return '{' + a + '} over {' + b + '}'; }
      if (n === 'sqrt') { const k = opt(); const a = group(); return k ? ' root {' + k + '} of {' + a + '} ' : ' sqrt {' + a + '} '; }
      if (n === 'binom') { const a = group(), b = group(); return 'LEFT ( {' + a + '} atop {' + b + '} RIGHT )'; }
      if (n === 'text' || n === 'textrm' || n === 'mbox') { ws(); let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && !--d) break; } const t = s.slice(i + 1, j); i = j + 1; return '"' + t + '"'; }
      if (ACC_L2H[n]) return ' ' + ACC_L2H[n] + ' ' + wrap(group()) + ' ';
      if (n === 'overset') { const a = group(), b = group(); return a === '\\frown' || a === 'frown' ? 'arch ' + wrap(b) : '{' + b + '} ^{' + a + '}'; }
      if (FONT_L2H[n]) return o?.hancom ? ' {' + FONT_L2H[n] + ' ' + group() + '} ' : ' ' + FONT_L2H[n] + ' ' + wrap(group()) + ' ';
      if (o?.hancom && DROP_L2H.has(n)) return ' ';
      if (n === 'left') { const d = delim(); const e = seq('\\right'); if (s.startsWith('\\right', i)) { i += 6; } const d2 = delim(); return 'LEFT ' + d + ' ' + e + ' RIGHT ' + d2; }
      if (n === 'begin') { ws(); const env = s.slice(i + 1, s.indexOf('}', i)); i = s.indexOf('}', i) + 1; const end = s.indexOf('\\end{' + env + '}', i); const body = s.slice(i, end < 0 ? s.length : end); i = end < 0 ? s.length : end + 6 + env.length;
        const rows = body.split(/\\\\/).map(r => r.split('&').map(c => latexToHwp(c, o).trim()).join(' & ')).join(' # ');
        return (ENV_L2H[env] || 'matrix') + '{' + rows + '}'; }
      if (n === ',' || n === ':' || n === ';' || n === '!') return '`';
      if (n === ' ' ) return '~';
      if (n === '\\') return ' # ';
      if (n === '{' || n === '}') return n;
      if (n === '%' || n === '$' || n === '#' || n === '&' || n === '_') return n;
      if (o?.hancom && UNI_L2H[n]) return ' ' + UNI_L2H[n] + ' ';
      if (L2H[n] !== undefined) return ' ' + L2H[n] + ' ';
      if (o?.unknown && /^[A-Za-z]+$/.test(n)) o.unknown.add(n);
      return ' ' + n + ' ';
    }
    if (c === '^' || c === '_') { i++; const a = group(); return c + wrap(a) + ' '; }// 첨자 뒤 글자가 붙어 첨자로 읽히지 않게 한 칸
    if (c === '~') { i++; return '~'; }
    i++; return c;
  }
  function seq(stop) {
    let out = '';
    while (i < s.length) { ws(); if (stop === '}' && s[i] === '}') break; if (stop && stop !== '}' && s.startsWith(stop, i)) break; out += one(); }
    return out;
  }
  return seq(null).replace(/\s+/g, ' ').replace(/ ([_^])/g, '$1').replace(/([_^]) /g, '$1').replace(/\{ /g, '{').replace(/ \}/g, '}').trim();
}

// 어느 쪽으로 쳤는지: 역슬래시 명령이 있으면 LaTeX, 한글 낱말이 있으면 한글 수식, 둘 다 없으면 'same'(둘이 같음)
export function detectSyntax(src) {
  const s = String(src || '');
  if (/\\[A-Za-z]/.test(s)) return 'latex';
  if (/(^|[^A-Za-z])(over|atop|sqrt|root|rm|it|bold|bar|vec|hat|dot|LEFT|RIGHT|times|cdot|div|LEQ|GEQ|leq|geq|inf|deg|matrix|pmatrix|bmatrix|dmatrix|cases|sum|int|lim|prod|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Omega|Sigma|therefore|approx|propto)(?![A-Za-z])|\+-|-\+|->|<->|=>|~|`|"/.test(s)) return 'hwp';
  return 'same';
}
// 한글 파일(HWPX·HWP)의 수식 스크립트를 한글 수식 문법으로(11-16, 1.7.1 B2).
// 5E 안(조판 엔진 rhwp)은 LaTeX을 그대로 읽지만 윈도우 한글은 한글 수식만 읽는다. 한글 수식이거나 둘이 같은 글이면 그대로 둔다.
export function hancomScript(src, unknown = null) {
  const s = String(src || '');
  return detectSyntax(s) === 'latex' ? latexToHwp(s, { hancom: true, unknown }) : s;
}
export function toLatex(src) { return detectSyntax(src) === 'hwp' ? hwpToLatex(src) : String(src || '').trim(); }

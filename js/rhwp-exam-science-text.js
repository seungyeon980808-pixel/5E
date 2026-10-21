// 과학 글 첨자 자동(10-22 새벽): 화학식 H2O→H₂O, 이온 Fe3+→Fe³⁺·SO42-→SO₄²⁻, 단위 m/s2→m/s², 기호 S1·V2→S₁·V₂.
// 글자는 바꾸지 않고 위·아래 첨자 모양만 입힌다(되돌리기로 한 번에 되돌림). scriptRanges는 글만 보고 범위를 찾는 순수 함수.
const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe '
  + 'Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
const isLetter = c => /[A-Za-z]/.test(c || '');
const isDigit = c => /[0-9]/.test(c || '');
const SIGN = /[+\-−]/;
// 단위 위 첨자: 숫자(띄어쓰기 하나까지)나 「/」「·」 뒤에 오는 단위 + 지수. m1·m2(질량 기호)처럼 앞에 숫자가 없으면 건드리지 않는다.
const UNIT = /(?<=(?:\d ?|[/·⋅*]))(km|cm|mm|nm|μm|m|s|kg|mg|g|mL|mol)([\-−]?\d)(?![A-Za-z0-9])/g;

// [{start, end, kind:'sub'|'sup'}] (end는 포함 안 함)
export function scriptRanges(text) {
  const out = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if ((c >= 'A' && c <= 'Z' || c === '(') && !isLetter(text[i - 1])) {
      const r = readFormula(text, i);
      if (r) { out.push(...r.ranges); i = r.end; continue; }
    }
    i++;
  }
  for (const m of text.matchAll(UNIT)) { const start = m.index + m[1].length; out.push({ start, end: start + m[2].length, kind: 'sup' }); }
  return out.sort((a, b) => a.start - b.start);
}

function readFormula(text, from) {
  let i = from, units = 0, groups = 0;
  const subs = [];
  const element = () => {
    const two = text.slice(i, i + 2);
    if (/^[A-Z][a-z]$/.test(two) && ELEMENTS.has(two)) { i += 2; return true; }
    if (/^[A-Z]$/.test(text[i] || '') && ELEMENTS.has(text[i])) { i += 1; return true; }
    return false;
  };
  const digits = () => { const d0 = i; while (isDigit(text[i])) i++; if (i > d0) subs.push({ start: d0, end: i }); };
  const unit = () => {
    const at = i, mark = subs.length;
    if (text[i] === '(') {
      i++; let inner = 0;
      while (i < text.length && text[i] !== ')') { if (!element()) break; digits(); inner++; }
      if (text[i] !== ')' || !inner) { i = at; subs.length = mark; return false; }
      i++; groups++;
    } else if (!element()) return false;
    digits(); units++; return true;
  };
  while (i < text.length && (text[i] === '(' || /[A-Z]/.test(text[i])) && unit());
  if (!units || isLetter(text[i])) return null;
  let charge = null;
  if (SIGN.test(text[i] || '') && !isLetter(text[i + 1]) && !isDigit(text[i + 1])) {
    const last = subs[subs.length - 1], touching = last && last.end === i;
    // Fe3+ 같은 원소 하나짜리는 숫자가 전하, SO42-처럼 숫자가 둘 이상이면 마지막 숫자가 전하, NH4+는 숫자는 아래 첨자·부호만 전하.
    if (touching && units === 1 && !groups) { subs.pop(); charge = { start: last.start, end: i + 1 }; }
    else if (touching && last.end - last.start >= 2) { last.end -= 1; charge = { start: i - 1, end: i + 1 }; }
    else charge = { start: i, end: i + 1 };
    i += 1;
  }
  if (!subs.length && !charge) return null;
  return { end: i, ranges: [...subs.map(r => ({ ...r, kind: 'sub' })), ...(charge ? [{ ...charge, kind: 'sup' }] : [])] };
}

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
// 문서 전체(본문 문단 + 본문 표의 칸)에 첨자를 입힌다. 고친 곳 수를 돌려준다.
export function applyScienceScripts(bridge) {
  if (!bridge?.input?.cursor) throw new Error('먼저 시험지를 여세요.');
  const doc = bridge.wasm.borrowDocumentHandle(), work = [];
  const style = kind => JSON.stringify(kind === 'sub' ? { subscript: true, superscript: false } : { superscript: true, subscript: false });
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const text = String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
      for (const r of scriptRanges(text)) work.push(() => doc.applyCharFormat(sec, p, r.start, r.end, style(r.kind)));
    }
  const seen = new Set();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if (c.type !== 'table' || c.cellPath?.length) continue;
    const sec = c.secIdx ?? 0, ci = c.controlIdx ?? c.ci, key = `${sec}:${c.paraIdx}:${ci}`;
    if (seen.has(key)) continue; seen.add(key);
    const cells = parse(doc.getTableDimensions(sec, c.paraIdx, ci)).cellCount;
    for (let cell = 0; cell < cells; cell++)
      for (let cp = 0; cp < doc.getCellParagraphCount(sec, c.paraIdx, ci, cell); cp++) {
        const text = String(doc.getTextInCell(sec, c.paraIdx, ci, cell, cp, 0, doc.getCellParagraphLength(sec, c.paraIdx, ci, cell, cp)));
        for (const r of scriptRanges(text)) work.push(() => doc.applyCharFormatInCell(sec, c.paraIdx, ci, cell, cp, r.start, r.end, style(r.kind)));
      }
  }
  if (!work.length) return 0;
  bridge.transaction('science-scripts', () => { for (const run of work) run(); return true; });
  return work.length;
}

// 숫자와 단위 사이 띄어쓰기(평가원 표기 「10 m」「2 kg」): 띄어 쓸 자리(글자 위치)를 돌려준다.
// s(초)는 오비탈(2s)과 겹쳐 빼고, 단위 뒤에 글자·숫자가 이어지면(2NaCl, 2N2) 화학식으로 보고 건드리지 않는다.
const UNIT_GAP = /(?<![A-Za-z])(\d)(km|cm|mm|nm|μm|kg|mg|mL|mol|Pa|Hz|kPa|kJ|m|g|L|N|J|W|V|A|K|℃)(?![A-Za-z0-9])/g;
export function unitGapPositions(text) {
  return [...String(text).matchAll(UNIT_GAP)].map(m => m.index + 1);
}
function forEachTextRun(doc, visit) {
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) visit({ kind: 'body', sec, p }, String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p))));
  const seen = new Set();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if (c.type !== 'table' || c.cellPath?.length) continue;
    const sec = c.secIdx ?? 0, ci = c.controlIdx ?? c.ci, key = `${sec}:${c.paraIdx}:${ci}`;
    if (seen.has(key)) continue; seen.add(key);
    const cells = parse(doc.getTableDimensions(sec, c.paraIdx, ci)).cellCount;
    for (let cell = 0; cell < cells; cell++) for (let cp = 0; cp < doc.getCellParagraphCount(sec, c.paraIdx, ci, cell); cp++)
      visit({ kind: 'cell', sec, para: c.paraIdx, ci, cell, cp }, String(doc.getTextInCell(sec, c.paraIdx, ci, cell, cp, 0, doc.getCellParagraphLength(sec, c.paraIdx, ci, cell, cp))));
  }
}
// [{where, text, at:[…]}] — 띄어쓰기가 빠진 곳이 있는 문단
export function unitGapIssues(doc) {
  const out = [];
  forEachTextRun(doc, (where, text) => { const at = unitGapPositions(text); if (at.length) out.push({ where, text, at }); });
  return out;
}
export function fixUnitGaps(bridge) {
  if (!bridge?.input?.cursor) throw new Error('먼저 시험지를 여세요.');
  const doc = bridge.wasm.borrowDocumentHandle(), list = unitGapIssues(doc);
  let count = 0;
  if (!list.length) return 0;
  bridge.transaction('unit-gaps', () => {
    for (const { where: w, at } of list) for (const o of [...at].reverse()) {
      if (w.kind === 'body') doc.insertText(w.sec, w.p, o, ' ');
      else doc.insertTextInCell(w.sec, w.para, w.ci, w.cell, w.cp, o, ' ');
      count++;
    }
    return true;
  });
  return count;
}

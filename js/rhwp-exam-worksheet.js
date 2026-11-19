// 학습지·시험지 조판 도구(10-21 밤). 시험지 머리 양식, 문항 간격 일괄, 상자·답란·평가 기준표·표 틀, 단·용지·쪽 번호·머리말, 점검.
// 1.7.1: 정답·배점·분류표·학생용 사본·가나형·QR·학습지 틀(교사용 기능)은 지웠다 — 5E_hwp는 인쇄 전 조판(모양만).
// 문서를 고치는 것은 모두 한 번의 되돌리기 단계(bridge.transaction). 「고른 문항만 새 파일로」는 지금 문서를 건드리지 않고 복사본에서 만든다.
import { insertTable } from './hwp-palette/native.js?v=1.7.0-four-session-integration';
import { unitGapIssues } from './rhwp-exam-science-text.js?v=1.7.0-four-session-integration';
import { columnWidth, questionBlocks, renumberDocument, allQuestionBlocks, topTables, blockLines, formatLine, lineCharProps } from './rhwp-exam-layout-tools.js?v=1.7.0-four-session-integration';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
// 문단 끝 위치(10-27 D4): 글 길이(getParagraphLength)에는 표·그림·수식 개체가 빠져 있다. 개체만 든 문단(5E_exam 선지 표)은 길이 0이라
// 「빈 줄」로 여겨 그 앞에 글을 써 넣었고(표 앞에 들어감), 글 끝에서 나누면 끝의 개체가 다음 문단으로 떨어졌다.
// 개체 수까지 더한 끝에서 나누고, 엔진이 받지 않으면 예전 위치로.
const controlCount = (doc, sec, p) => { try { const x = doc.getControlTextPositions(sec, p); return (typeof x === 'string' ? JSON.parse(x || '[]') : x || []).length; } catch { return 0; } };
const paraEnd = (doc, sec, p) => doc.getParagraphLength(sec, p) + controlCount(doc, sec, p);
const splitAtEnd = (doc, sec, p) => { try { return doc.splitParagraph(sec, p, paraEnd(doc, sec, p)); } catch { return splitAtEnd(doc, sec, p); } };
// 쪽 배치가 「표」라고 알려 준 개체가 엔진에서는 표가 아닐 때가 있다(10-27 D2: 기출 변형 문항의 그림·수식) —
// 엔진이 「지정된 컨트롤이 표가 아닙니다」를 던져 점검 전체가 멈췄다. 표로 읽지 못하면 칸 0개로 보고 건너뛴다.
const tableCellCount = (doc, sec, para, ci) => { try { return parse(doc.getTableDimensions(sec, para, ci)).cellCount || 0; } catch { return 0; } };

function requireInput(bridge) {
  const input = bridge?.input;
  if (!input?.cursor) throw Object.assign(new Error('먼저 시험지를 여세요.'), { code: 'no-document' }); // 1.7.1 B6: 화면 쪽이 파일 메뉴를 펼친다
  return input;
}

// 자주 쓰는 발문(평가원 과학탐구에서 많이 쓰는 꼴).
export const STEMS = [
  '이에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?',
  '이에 대한 설명으로 옳은 것은?', '이에 대한 설명으로 옳지 않은 것은?',
  '이에 대한 옳은 설명만을 〈보기〉에서 있는 대로 고른 것은?',
  '제시한 내용이 옳은 학생만을 있는 대로 고른 것은?',
  '다음은 이에 대한 학생 A, B, C의 대화이다.',
  '(가)와 (나)에 들어갈 내용으로 가장 적절한 것은?',
  '다음은 ○○에 대한 실험이다.', '이 실험에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?',
  '[3점]', '(단, 다른 조건은 동일하다.)',
];

// 표 머리 줄 음영: 커서가 있는 표의 첫 줄 칸에 음영과 굵게.
export function shadeHeaderRow(bridge, color = '#eef2f7') {
  const input = requireInput(bridge);
  if (!input.cursor.isInCell?.()) throw new Error('음영을 넣을 표의 칸을 먼저 누르세요.');
  const pos = input.getCursorPosition();
  if ((pos.cellPath?.length || 1) > 1) throw new Error('표 안의 표는 아직 머리 줄을 칠할 수 없습니다.');
  const doc = bridge.wasm.borrowDocumentHandle(), sec = pos.sectionIndex, para = pos.parentParaIndex, ci = pos.controlIndex;
  const count = tableCellCount(doc, sec, para, ci), heads = [];
  for (let cell = 0; cell < count; cell++) { const info = parse(doc.getCellInfo(sec, para, ci, cell)); if (info.row === 0) heads.push(cell); }
  bridge.transaction('shade-header', () => {
    for (const cell of heads) {
      doc.setCellProperties(sec, para, ci, cell, JSON.stringify({ fillType: 'solid', fillColor: color }));
      for (let cp = 0; cp < doc.getCellParagraphCount(sec, para, ci, cell); cp++) {
        const len = doc.getCellParagraphLength(sec, para, ci, cell, cp);
        if (len) doc.applyCharFormatInCell(sec, para, ci, cell, cp, 0, len, JSON.stringify({ bold: true }));
      }
    }
    return true;
  });
  return heads.length;
}

// 시험지 머리: 문서 맨 앞에 제목 줄과 「학년·반·번호·이름」 칸 표를 넣는다.
export function insertExamHeader(bridge, { title = '', subject = '', grade = '' } = {}) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), sec = 0, width = columnWidth(doc, sec);
  const heading = [title.trim(), subject.trim() && `${subject.trim()}`].filter(Boolean).join(' — ') || '시험지';
  bridge.transaction('exam-header', () => {
    parse(doc.splitParagraph(sec, 0, 0)); parse(doc.splitParagraph(sec, 0, 0));
    doc.insertText(sec, 0, 0, heading);
    doc.applyCharFormat(sec, 0, 0, [...heading].length, JSON.stringify({ bold: true, fontSize: 1500 }));
    doc.applyParaFormat(sec, 0, JSON.stringify({ alignment: 'center' }));
    const at = { sectionIndex: sec, paragraphIndex: 1, charOffset: 0 };
    insertTable(doc, at, 1, 4, [[`${grade.trim() || '  '}학년`, '   반', '   번', '이름:']], new Map(), { width, border: 'Solid' });
    return true;
  });
  return heading;
}

// 교사만 보는 줄(문서에 이미 있는 「[정답] ③」「[해설]」 등): 점검(선지 번호·부정 표현)에서 건너뛴다.
const TEACHER_ONLY = /^\s*(?:[\[【〈<(]\s*(?:정답|해설|풀이|채점\s*기준|교사용|출처|메모|성취기준|난이도|내용\s*영역|빈칸 정답|나형 대응|나형 정답)\s*[\]】〉>)]|(?:정답|해설|풀이)\s*[:：])/;
const MARKS = '①②③④⑤';
// 문항과 그 안의 줄(본문·표 칸) — 표 하나로 된 학교 시험 문항도 칸 글을 읽는다.
function blocksWithLines(doc) {
  const tables = topTables(doc), out = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const q of questionBlocks(doc, sec, tables)) out.push({ ...q, sec, lines: blockLines(doc, sec, q, tables) });
  return out;
}
// 문항 간격 일괄: 「1.」로 시작하는 문단(첫 문항 빼고)의 위 간격을 pt로 맞춘다.
export function setQuestionSpacing(bridge, pt) {
  requireInput(bridge);
  if (!(pt >= 0 && pt <= 72)) throw new Error('문항 간격은 0~72pt로 고르세요.');
  const doc = bridge.wasm.borrowDocumentHandle(), targets = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const len = doc.getParagraphLength(sec, p);
      if (len && /^\s*\d{1,3}\./.test(String(doc.getTextRange(sec, p, 0, len)))) targets.push({ sec, p });
    }
  if (targets.length < 2) throw new Error('번호가 붙은 문항이 둘 이상 있어야 간격을 맞출 수 있습니다.');
  bridge.transaction('question-spacing', () => {
    for (const t of targets.slice(1)) doc.applyParaFormat(t.sec, t.p, JSON.stringify({ spacingBefore: Math.round(pt * 200) }));
    return true;
  });
  return targets.length - 1;
}

// 글꼴 맞추기: 문항 첫 줄 글꼴·크기가 대부분과 다른 문항(다른 곳에서 복사해 온 문항)을 대부분 쪽으로 맞춘다.
// 그 문항의 본문 문단 글꼴을 바꾸고, 크기는 첫 줄과 같은 크기였던 글자만 바꾼다(작게 둔 〈보기〉·선지 크기는 그대로). 고친 문항 수.
export function unifyQuestionFonts(bridge) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle(), wasm = bridge.wasm, blocks = [];
  const keyOf = c => `${c.fontFamily}|${c.fontSize}`;
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const q of questionBlocks(doc, sec)) {
    const len = doc.getParagraphLength(sec, q.head); if (!len) continue;
    blocks.push({ ...q, sec, first: parse(doc.getCharPropertiesAt(sec, q.head, Math.min(len - 1, 3))) });
  }
  if (blocks.length < 2) throw new Error('문항이 둘 이상 있어야 글꼴을 맞출 수 있습니다.');
  const count = new Map(); for (const b of blocks) count.set(keyOf(b.first), (count.get(keyOf(b.first)) || 0) + 1);
  const [majorKey] = [...count].sort((a, b) => b[1] - a[1])[0], [family, size] = [majorKey.split('|')[0], Number(majorKey.split('|')[1])];
  const odd = blocks.filter(b => keyOf(b.first) !== majorKey);
  if (!odd.length) return 0;
  bridge.transaction('unify-question-fonts', () => {
    for (const b of odd) for (let p = b.start; p < b.end; p++) {
      const len = doc.getParagraphLength(b.sec, p); if (!len) continue;
      if (b.first.fontSize !== size) {
        let from = -1;
        for (let o = 0; o <= len; o++) {
          const same = o < len && parse(wasm.getCharPropertiesAt(b.sec, p, o)).fontSize === b.first.fontSize;
          if (same && from < 0) from = o;
          if (!same && from >= 0) { doc.applyCharFormat(b.sec, p, from, o, JSON.stringify({ fontSize: size })); from = -1; }
        }
      }
      doc.applyCharFormat(b.sec, p, 0, len, JSON.stringify({ fontFamily: family }));
    }
    return true;
  });
  input.updateCaret?.();
  return odd.length;
}

// 수식 크기: 본문 수식은 그 문단 글자 크기(가장 흔한 크기), 표 칸 수식은 문서 본문 글자 크기(문항 첫 줄에서 가장 흔한 크기)에 맞춘다.
// [{sec, para, ci, cell, cp, size, target}] — 0.5pt 넘게 다른 것만.
function paragraphFontSize(doc, sec, para) {
  const len = doc.getParagraphLength(sec, para), counts = new Map();
  for (let o = 0; o < Math.min(len, 40); o++) { const size = parse(doc.getCharPropertiesAt(sec, para, o)).fontSize; counts.set(size, (counts.get(size) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
export function equationSizeIssues(doc) {
  const body = new Map();
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const q of questionBlocks(doc, sec)) { const size = paragraphFontSize(doc, sec, q.head); if (size) body.set(size, (body.get(size) || 0) + 1); }
  const bodySize = [...body].sort((a, b) => b[1] - a[1])[0]?.[0] || 1000, out = [], seen = new Set();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if (c.type !== 'equation') continue;
    const sec = c.secIdx ?? 0, ci = c.controlIdx ?? c.ci, inCell = Number.isInteger(c.cellIdx), cell = inCell ? c.cellIdx : -1, cp = inCell ? c.cellParaIdx : -1, key = `${sec}:${c.paraIdx}:${ci}:${cell}:${cp}`;
    if (seen.has(key)) continue; seen.add(key);
    let size; try { size = parse(doc.getEquationProperties(sec, c.paraIdx, ci, cell, cp)).fontSize; } catch { continue; }
    const target = inCell ? bodySize : (paragraphFontSize(doc, sec, c.paraIdx) || bodySize);
    if (Math.abs(size - target) > 50) out.push({ sec, para: c.paraIdx, ci, cell, cp, size, target });
  }
  return out;
}
export function fitEquationSizes(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), list = equationSizeIssues(doc);
  if (!list.length) return 0;
  bridge.transaction('fit-equation-sizes', () => { for (const e of list) parse(doc.setEquationProperties(e.sec, e.para, e.ci, e.cell, e.cp, JSON.stringify({ fontSize: e.target }))); return true; });
  return list.length;
}

// 부정 표현 밑줄(평가원 발문 규칙): 「?」로 끝나는 발문의 「않은·아닌·없는·틀린 것」에서 부정어에 밑줄. [{sec, para, start, end, word, label}] — 밑줄이 없는 것만.
const NEGATIVE = /(않은|아닌|없는|틀린)(?=\s*것)/g;
export function negativeWordIssues(doc) {
  const out = [];
  for (const q of blocksWithLines(doc)) for (const { text: t, where } of q.lines) {
    if (!/\?\s*(?:[\[(]\d+(?:\.\d+)?\s*점[\])])?\s*$/.test(t) || TEACHER_ONLY.test(t)) continue;
    for (const m of t.matchAll(NEGATIVE)) {
      let all = true; for (let o = m.index; o < m.index + m[0].length && all; o++) all = lineCharProps(doc, where, o).underline === true;
      if (!all) out.push({ sec: q.sec, para: where.p, where, start: m.index, end: m.index + m[0].length, word: m[0], label: q.label });
    }
  }
  return out;
}
export function underlineNegativeWords(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), list = negativeWordIssues(doc);
  if (!list.length) return 0;
  bridge.transaction('negative-underline', () => { for (const w of list) formatLine(doc, w.where, w.start, w.end, { underline: true }); return true; });
  return list.length;
}

// 문서 요약(점검 창 맨 위 한 줄): 문항 수(선택형·서술형), 쪽 수.
export function examSummary(doc) {
  const blocks = blocksWithLines(doc), essay = blocks.filter(b => b.essay).length;
  return blocks.length ? `문항 ${blocks.length}${essay ? `(선택형 ${blocks.length - essay}·서술형 ${essay})` : ''} · ${doc.pageCount()}쪽` : '';
}

// 점검 더하기: 선지 번호·〈보기〉 차례·부정 표현·단위 띄어쓰기·수식 크기·글꼴 섞임. [{text, at}]
export function extraChecks(doc) {
  const issues = [], fonts = new Map(), blocks = blocksWithLines(doc);
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const len = doc.getParagraphLength(sec, p); if (!len) continue;
      const text = String(doc.getTextRange(sec, p, 0, len)), at = { sectionIndex: sec, paragraphIndex: p, charOffset: 0 };
      if (/^\s*\d{1,3}\./.test(text)) {
        const c = parse(doc.getCharPropertiesAt(sec, p, Math.min(len - 1, 3)));
        const key = `${c.fontFamily} ${c.fontSize / 100}pt`;
        if (!fonts.has(key)) fonts.set(key, []);
        fonts.get(key).push(at);
      }
    }
  for (const q of blocks) {
    if (q.essay) continue;
    const sec = q.sec, lines = q.lines.map(l => l.text).filter(t => !TEACHER_ONLY.test(t));
    // 선지 번호: ①~⑤가 차례대로 한 번씩인지(교사용 줄은 빼고).
    const marks = lines.map(t => (t.match(/[①-⑤]/g) || []).join('')).join('');
    if (marks && marks !== MARKS) issues.push({ text: `${q.label} 선지 번호가 차례대로가 아닙니다(${marks}).`, at: { sectionIndex: sec, paragraphIndex: q.head, charOffset: 0 } });
    // 〈보기〉: 「ㄱ.」「ㄴ.」… 항목이 차례대로인지, 선지에 〈보기〉에 없는 기호가 있는지.
    const items = lines.map(t => /^\s*([ㄱ-ㅎ])\s*[.．]/.exec(t)?.[1]).filter(Boolean);
    if (items.length) {
      const want = 'ㄱㄴㄷㄹㅁㅂㅅ'.slice(0, items.length);
      if (items.join('') !== want) issues.push({ text: `${q.label} 〈보기〉 항목이 차례대로가 아닙니다(${items.join('')}).`, at: { sectionIndex: sec, paragraphIndex: q.head, charOffset: 0 } });
      const used = new Set(lines.filter(t => /[①-⑤]/.test(t)).flatMap(t => t.split(/[①-⑤]/).slice(1)).flatMap(part => /^\s*[ㄱ-ㅎ](?:\s*,\s*[ㄱ-ㅎ])*\s*$/.test(part) ? part.match(/[ㄱ-ㅎ]/g) : []));
      const extra = [...used].filter(c => !items.includes(c)).sort();
      if (extra.length) issues.push({ text: `${q.label} 선지에 〈보기〉에 없는 ${extra.join('·')}이 있습니다.`, at: { sectionIndex: sec, paragraphIndex: q.head, charOffset: 0 } });
    }
  }
  for (const w of negativeWordIssues(doc)) issues.push({ text: `${w.label} 발문의 부정 표현 「${w.word}」에 밑줄이 없습니다(평가원 발문 규칙).`, at: { sectionIndex: w.sec, paragraphIndex: w.para, charOffset: w.start } });
  const gaps = unitGapIssues(doc), gapCount = gaps.reduce((n, g) => n + g.at.length, 0);
  if (gapCount) { const g = gaps[0], at = g.at[0], sample = g.text.slice(Math.max(0, at - 3), at + 3).trim(); issues.push({ text: `숫자와 단위 사이 띄어쓰기가 빠진 곳이 ${gapCount}곳 있습니다(예: ${sample} → 평가원 표기는 「10 m」).`, at: g.where.kind === 'body' ? { sectionIndex: g.where.sec, paragraphIndex: g.where.p, charOffset: at } : null }); }
  const equations = equationSizeIssues(doc);
  if (equations.length) issues.push({ text: `수식 ${equations.length}개의 크기가 둘레 글자와 다릅니다(예: ${equations[0].size / 100}pt → ${equations[0].target / 100}pt).`, at: { sectionIndex: equations[0].sec, paragraphIndex: equations[0].para, charOffset: 0 } });
  if (fonts.size > 1) {
    const [major] = [...fonts].sort((a, b) => b[1].length - a[1].length);
    for (const [key, ats] of fonts) if (key !== major[0]) issues.push({ text: `문항 첫 줄 글꼴이 다릅니다(${key} · 대부분은 ${major[0]}).`, at: ats[0] });
  }
  return issues;
}

// ── 수업 자료 틀: 상자·답란·평가 기준표 ──
const LINE = { type: 1, width: 1, color: '#000000' }, NO_LINE = { type: 0, width: 0, color: '#000000' };
const mmUnits = mm => Math.round(mm * 7200 / 25.4);
// 커서 문단 뒤에 새 문단을 만들고 그 자리에 표를 넣는다(지금 글을 가르지 않게). 만든 표의 {para, ci}를 돌려준다.
function tableAfterCursor(bridge, doc, rows, cols, grid, options) {
  const pos = bridge.input.getCursorPosition();
  if (pos.cellPath?.length || bridge.input.cursor.isInCell?.()) throw new Error('표 밖 본문에 커서를 두고 누르세요.');
  const sec = pos.sectionIndex, para = pos.paragraphIndex;
  parse(splitAtEnd(doc, sec, para));
  const before = new Set();
  const tablesIn = p => { const out = []; for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if (c.type === 'table' && c.secIdx === sec && c.paraIdx === p && !(c.cellPath || []).length) out.push(c.controlIdx ?? c.ci); return out; };
  insertTable(doc, { sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 }, rows, cols, grid, options.assets || new Map(), options);
  for (let p = para + 1; p < doc.getParagraphCount(sec); p++) { const found = tablesIn(p).filter(ci => !before.has(`${p}:${ci}`)); if (found.length) return { sec, para: p, ci: found[0] }; }
  throw new Error('표를 넣었지만 위치를 찾지 못했습니다.');
}
const setCell = (doc, t, cell, props) => doc.setCellProperties(t.sec, t.para, t.ci, cell, JSON.stringify(props));

// [제목, 머리 음영, 미리 채울 줄(없으면 빈 칸)]
export const BOX_PRESETS = [['개념 정리', '#eef2f7'], ['탐구 활동', '#eef6ee'], ['생각해 보기', '#fbf3e4'], ['주의', '#fbeaea'],
  ['유의 사항', '#eef2f7', ['1. 답안지에 학년·반·번호·이름을 정확히 쓰시오.', '2. 선택형은 컴퓨터용 사인펜으로 답안지에 표기하시오.', '3. 서술형은 검은색 볼펜으로 답란 안에 쓰시오.', '4. 문항에 따라 배점이 다르니 각 물음의 끝에 표시된 배점을 참고하시오.']]];
// 제목 줄(음영·굵게)과 내용 칸 하나로 된 상자.
export function insertBox(bridge, title = '개념 정리') {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), [, shade, lines] = BOX_PRESETS.find(([t]) => t === title) || BOX_PRESETS[0];
  bridge.transaction('insert-box', () => {
    const t = tableAfterCursor(bridge, doc, 2, 1, [[title], [lines ? { kind: 'multiline', lines } : '']], { width: columnWidth(doc), border: 'Solid', heights: [mmUnits(7), mmUnits(lines ? 6 * lines.length : 30)] });
    setCell(doc, t, 0, { fillType: 'solid', fillColor: shade });
    doc.applyCharFormatInCell(t.sec, t.para, t.ci, 0, 0, 0, [...title].length, JSON.stringify({ bold: true }));
    return true;
  });
  return title;
}
// 서술형 답란: 아래 줄만 있는 칸 n줄(줄 간격 10mm).
export function insertAnswerLines(bridge, lines = 5) {
  requireInput(bridge);
  if (!(lines >= 1 && lines <= 20)) throw new Error('답란은 1~20줄로 고르세요.');
  const doc = bridge.wasm.borrowDocumentHandle();
  bridge.transaction('answer-lines', () => {
    const t = tableAfterCursor(bridge, doc, lines, 1, Array.from({ length: lines }, () => ['']), { width: columnWidth(doc), border: 'None', heights: Array(lines).fill(mmUnits(10)) });
    for (let cell = 0; cell < lines; cell++) setCell(doc, t, cell, { borderBottom: { type: 1, width: 1, color: '#8a8f98' }, borderTop: NO_LINE, borderLeft: NO_LINE, borderRight: NO_LINE });
    return true;
  });
  return lines;
}
// 평가 기준표: 평가 요소 | 상 | 중 | 하, 머리 줄 음영.
export function insertRubric(bridge, items = 3) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), rows = items + 1;
  bridge.transaction('rubric', () => {
    const t = tableAfterCursor(bridge, doc, rows, 4, [['평가 요소', '상', '중', '하'], ...Array.from({ length: items }, () => ['', '', '', ''])], { width: columnWidth(doc), border: 'Solid', heights: [mmUnits(7), ...Array(items).fill(mmUnits(14))] });
    for (let cell = 0; cell < 4; cell++) {
      setCell(doc, t, cell, { fillType: 'solid', fillColor: '#eef2f7' });
      const label = ['평가 요소', '상', '중', '하'][cell];
      doc.applyCharFormatInCell(t.sec, t.para, t.ci, cell, 0, 0, [...label].length, JSON.stringify({ bold: true }));
      doc.applyParaFormatInCell(t.sec, t.para, t.ci, cell, 0, JSON.stringify({ alignment: 'center' }));
    }
    return true;
  });
  return items;
}

// 학습지 표 틀: 머리 줄(음영·굵게·가운데) + 빈 줄. [이름, 머리 칸들, 빈 줄 수, 줄 높이 mm]
export const TABLE_PRESETS = [
  ['KWL 표', ['알고 있는 것(K)', '알고 싶은 것(W)', '새로 배운 것(L)'], 1, 40],
  ['비교표', ['비교 항목', '(가)', '(나)'], 4, 10],
  ['실험 결과 표', ['구분', '1회', '2회', '3회', '평균'], 3, 9],
  ['용어 정리표', ['용어', '뜻', '예'], 5, 10],
];
export function insertTablePreset(bridge, name) {
  requireInput(bridge);
  const preset = TABLE_PRESETS.find(([n]) => n === name); if (!preset) throw new Error('표 틀을 다시 고르세요.');
  const [, head, empty, rowMm] = preset, cols = head.length, doc = bridge.wasm.borrowDocumentHandle();
  bridge.transaction('table-preset', () => {
    const t = tableAfterCursor(bridge, doc, empty + 1, cols, [head, ...Array.from({ length: empty }, () => Array(cols).fill(''))], { width: columnWidth(doc), border: 'Solid', heights: [mmUnits(8), ...Array(empty).fill(mmUnits(rowMm))] });
    head.forEach((label, cell) => {
      setCell(doc, t, cell, { fillType: 'solid', fillColor: '#eef2f7' });
      doc.applyCharFormatInCell(t.sec, t.para, t.ci, cell, 0, 0, [...label].length, JSON.stringify({ bold: true }));
      doc.applyParaFormatInCell(t.sec, t.para, t.ci, cell, 0, JSON.stringify({ alignment: 'center' }));
    });
    return true;
  });
  return name;
}

// ── 판짜기: 단·용지 ──
function refuseWhenLocked(bridge) {
  if (bridge.tableLayoutLocked) throw new Error('구조 잠금 중입니다. 단·용지는 구조 잠금을 풀고 바꾸세요.');
}
// 모든 구역을 n단으로(2단이면 단 사이 8mm).
export function setColumns(bridge, count) {
  requireInput(bridge); refuseWhenLocked(bridge);
  if (![1, 2, 3].includes(count)) throw new Error('단은 1~3단으로 고르세요.');
  const doc = bridge.wasm.borrowDocumentHandle();
  bridge.transaction('set-columns', () => {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) doc.setColumnDef(sec, count, 0, true, count > 1 ? mmUnits(8) : 0);
    return true;
  });
  return count;
}
export const PAPERS = { A4: [210, 297], B4: [257, 364], A3: [297, 420] };
// 용지 크기만 바꾸고 여백·방향은 그대로.
export function setPaper(bridge, name) {
  requireInput(bridge); refuseWhenLocked(bridge);
  const size = PAPERS[name]; if (!size) throw new Error('용지는 A4·B4·A3 중에서 고르세요.');
  const doc = bridge.wasm.borrowDocumentHandle();
  bridge.transaction('set-paper', () => {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) {
      const page = parse(doc.getPageDef(sec)), [w, h] = page.landscape ? [size[1], size[0]] : size;
      doc.setPageDef(sec, JSON.stringify({ ...page, width: mmUnits(w), height: mmUnits(h) }));
    }
    return true;
  });
  return name;
}
// 쪽 번호: 모든 구역 꼬리말(양 쪽)을 가운데 쪽 번호로 다시 만든 뒤 모양을 붙인다. 다시 눌러도 같은 꼬리말.
// 꼬리말 필드 1=쪽 번호, 2=총 쪽수(엔진 마당 2번이 「가운데 쪽 번호」).
export const PAGE_NUMBER_STYLES = { dash: '- 1 -', total: '1 / 4', dashTotal: '- 1 / 4 -' };
export function insertPageNumbers(bridge, style = 'dash') {
  requireInput(bridge);
  if (!PAGE_NUMBER_STYLES[style]) throw new Error('쪽 번호 모양을 다시 고르세요.');
  const doc = bridge.wasm.borrowDocumentHandle();
  const ok = value => { const r = parse(value); if (r?.ok === false) throw new Error(r.error || '꼬리말을 만들지 못했습니다.'); return r; };
  bridge.transaction('page-numbers', () => {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) {
      ok(doc.applyHfTemplate(sec, false, 0, 2));
      const text = String(parse(doc.getHeaderFooter(sec, false, 0)).text || ''), at = text.indexOf('\u0015');
      if (at < 0) throw new Error('쪽 번호 칸을 만들지 못했습니다.');
      const dash = style !== 'total';
      if (dash) ok(doc.insertTextInHeaderFooter(sec, false, 0, 0, at, '- '));
      let end = at + (dash ? 3 : 1);
      if (style !== 'dash') { ok(doc.insertTextInHeaderFooter(sec, false, 0, 0, end, ' / ')); end += 3; ok(doc.insertFieldInHf(sec, false, 0, 0, end, 2)); end += 1; }
      if (dash) ok(doc.insertTextInHeaderFooter(sec, false, 0, 0, end, ' -'));
    }
    return true;
  });
  return PAGE_NUMBER_STYLES[style];
}
// 머리말: 모든 구역 머리말(양 쪽)을 가운데 맞춘 한 줄(시험 이름 등)로 다시 만든다. 빈 글이면 머리말 글을 지운다.
export function insertRunningHeader(bridge, text) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), line = String(text || '').trim();
  const ok = value => { const r = parse(value); if (r?.ok === false) throw new Error(r.error || '머리말을 만들지 못했습니다.'); return r; };
  bridge.transaction('running-header', () => {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) {
      ok(doc.applyHfTemplate(sec, true, 0, 0));
      if (!line) continue;
      ok(doc.insertTextInHeaderFooter(sec, true, 0, 0, 0, line));
      try { doc.applyParaFormatInHf(sec, true, 0, 0, JSON.stringify({ alignment: 'center' })); } catch {}
    }
    return true;
  });
  return line;
}
// 고른 문항만 새 파일로: 「3, 5, 7-9」처럼 고른 번호의 문항만 남긴 사본(번호 다시 매김). 지금 문서는 그대로. {bytes, count, numbers}
export function parseNumberList(text) {
  const out = new Set();
  for (const part of String(text || '').split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d{1,3})(?:\s*[-~～]\s*(\d{1,3}))?$/.exec(part); if (!m) throw new Error(`「${part}」를 번호로 읽지 못했습니다. 예: 3, 5, 7-9`);
    const a = Number(m[1]), b = Number(m[2] || m[1]); for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
export function pickQuestionsCopy(bridge, text) {
  requireInput(bridge);
  const numbers = parseNumberList(text); if (!numbers.length) throw new Error('뽑을 문항 번호를 쓰세요. 예: 3, 5, 7-9');
  const doc = bridge.wasm.borrowDocumentHandle(), keep = new Set(numbers);
  const chosen = allQuestionBlocks(doc).filter(q => !q.essay && keep.has(q.number));
  if (!chosen.length) throw new Error('그 번호의 선택형 문항을 찾지 못했습니다.');
  const Document = doc.constructor, copy = new Document(doc.exportHwpx());
  try {
    // 뒤에서부터 남기지 않을 문항(묶음 머리·지문 포함 범위)을 지운다. 첫 문항 앞 머리(시험지 머리 등)는 남긴다.
    for (let sec = copy.getSectionCount() - 1; sec >= 0; sec--) {
      const blocks = questionBlocks(copy, sec);
      for (let i = blocks.length - 1; i >= 0; i--) {
        const q = blocks[i]; if (!q.essay && keep.has(q.number)) continue;
        if (q.end < copy.getParagraphCount(sec)) parse(copy.deleteRange(sec, q.start, 0, q.end, 0));
        else if (q.start > 0) parse(copy.deleteRange(sec, q.start - 1, copy.getParagraphLength(sec, q.start - 1), q.end - 1, copy.getParagraphLength(sec, q.end - 1)));
        else parse(copy.deleteRange(sec, 0, 0, q.end - 1, copy.getParagraphLength(sec, q.end - 1)));
      }
    }
    renumberDocument(copy);
    return { bytes: copy.exportHwpx(), count: chosen.length, numbers: chosen.map(q => q.number) };
  } finally { copy.free(); }
}

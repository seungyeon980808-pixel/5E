// 학습지·시험지 만들기 도구(10-21 밤). 빈칸 학습지(표시 → 학생용 사본·정답 모음), 시험지 머리 양식, 정답표 칸, 문항 간격 일괄.
// 문서를 고치는 것은 모두 한 번의 되돌리기 단계(bridge.transaction). 학생용 사본은 지금 문서를 건드리지 않고 복사본에서 만든다.
import { insertTable } from './hwp-palette/native.js';
import { columnWidth } from './rhwp-exam-layout-tools.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
// 빈칸 표시: 연한 파랑 바탕 + 밑줄. 교사용 문서에서 눈에 띄고, 학생용에서는 빈칸으로 바뀐다.
export const BLANK_SHADE = '#dce8ff';
const BLANK_MARK = { shadeColor: BLANK_SHADE, underline: true };
const BLANK_CLEAR = { shadeColor: '#ffffff', underline: false };

function requireInput(bridge) {
  const input = bridge?.input;
  if (!input?.cursor) throw new Error('먼저 시험지를 여세요.');
  return input;
}

// 고른 글자를 빈칸으로 표시하거나 표시를 지운다(스튜디오의 글자 서식 경로라 본문·표 칸 모두 된다).
export function markBlank(bridge, on = true) {
  const input = requireInput(bridge);
  if (!input.cursor.hasSelection?.()) throw new Error(on ? '빈칸으로 만들 낱말을 먼저 끌어 고르세요.' : '표시를 지울 부분을 먼저 고르세요.');
  bridge.deps.eventBus.emit('format-char', on ? BLANK_MARK : BLANK_CLEAR);
  return true;
}

const isBlank = props => String(parse(props)?.shadeColor || '').toLowerCase() === BLANK_SHADE;

// 본문 문단과 본문 표(한 겹) 칸에서 빈칸 표시 구간을 문서 순서로 모은다. [{where, start, end, text}]
export function collectBlanks(doc) {
  const out = [];
  const scan = (length, propsAt, textOf, where) => {
    let start = -1;
    for (let i = 0; i <= length; i++) {
      const marked = i < length && isBlank(propsAt(i));
      if (marked && start < 0) start = i;
      if (!marked && start >= 0) { out.push({ where, start, end: i, text: textOf(start, i) }); start = -1; }
    }
  };
  for (let sec = 0; sec < doc.getSectionCount(); sec++) {
    const tables = new Map();
    for (let page = 0; page < doc.pageCount(); page++)
      for (const c of parse(doc.getPageControlLayout(page)).controls || [])
        if (c.type === 'table' && c.secIdx === sec && !(c.cellPath || []).length) tables.set(`${c.paraIdx}:${c.controlIdx ?? c.ci}`, { para: c.paraIdx, ci: c.controlIdx ?? c.ci });
    const byPara = new Map();
    for (const t of tables.values()) { if (!byPara.has(t.para)) byPara.set(t.para, []); byPara.get(t.para).push(t); }
    for (let para = 0; para < doc.getParagraphCount(sec); para++) {
      const len = doc.getParagraphLength(sec, para);
      scan(len, i => doc.getCharPropertiesAt(sec, para, i), (a, b) => String(doc.getTextRange(sec, para, a, b - a)), { kind: 'body', sec, para });
      for (const t of byPara.get(para) || []) {
        const cells = parse(doc.getTableDimensions(sec, para, t.ci)).cellCount;
        for (let cell = 0; cell < cells; cell++) {
          const paras = doc.getCellParagraphCount(sec, para, t.ci, cell);
          for (let cp = 0; cp < paras; cp++) {
            const clen = doc.getCellParagraphLength(sec, para, t.ci, cell, cp);
            scan(clen, i => doc.getCellCharPropertiesAt(sec, para, t.ci, cell, cp, i), (a, b) => String(doc.getTextInCell(sec, para, t.ci, cell, cp, a, b - a)), { kind: 'cell', sec, para, ci: t.ci, cell, cp });
          }
        }
      }
    }
  }
  return out;
}

// 빈칸 너비: 낱말 길이에 맞춰 전각 빈칸(최소 4칸). 학생이 손으로 쓸 자리.
export const blankText = word => `(${'　'.repeat(Math.max(4, Math.min(16, Math.round([...word.trim()].length * 1.6))))})`;

function replaceRange(doc, w, start, end, text) {
  if (w.kind === 'body') {
    doc.deleteText(w.sec, w.para, start, end - start);
    doc.insertText(w.sec, w.para, start, text);
    doc.applyCharFormat(w.sec, w.para, start, start + [...text].length, JSON.stringify(BLANK_CLEAR));
  } else {
    doc.deleteTextInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, end - start);
    doc.insertTextInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, text);
    doc.applyCharFormatInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, start + [...text].length, JSON.stringify(BLANK_CLEAR));
  }
}

// 학생용 사본: 지금 문서를 복사해 빈칸 표시 낱말을 「(　　　)」로 바꾼 HWPX 바이트. 지금 문서는 그대로다.
export function studentCopy(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blanks = collectBlanks(doc);
  if (!blanks.length) throw new Error('빈칸으로 표시한 낱말이 없습니다. 낱말을 고르고 「빈칸 표시」를 누르세요.');
  const Document = doc.constructor, copy = new Document(doc.exportHwpx());
  try {
    // 같은 문단 안에서는 뒤에서부터 바꿔야 앞 구간 위치가 그대로다.
    for (const blank of [...blanks].reverse()) replaceRange(copy, blank.where, blank.start, blank.end, blankText(blank.text));
    return { bytes: copy.exportHwpx(), count: blanks.length, answers: blanks.map(b => b.text) };
  } finally { copy.free(); }
}

// 정답 모아 넣기: 문서 끝에 「[빈칸 정답] 1. … 2. …」 문단을 붙인다(교사용).
export function appendBlankAnswers(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blanks = collectBlanks(doc);
  if (!blanks.length) throw new Error('빈칸으로 표시한 낱말이 없습니다.');
  const sec = doc.getSectionCount() - 1, last = doc.getParagraphCount(sec) - 1;
  const line = `[빈칸 정답] ${blanks.map((b, i) => `${i + 1}. ${b.text.trim()}`).join('   ')}`;
  bridge.transaction('blank-answers', () => {
    const end = doc.getParagraphLength(sec, last);
    parse(doc.splitParagraph(sec, last, end));
    doc.insertText(sec, last + 1, 0, line);
    doc.applyCharFormat(sec, last + 1, 0, [...line].length, JSON.stringify(BLANK_CLEAR));
    return true;
  });
  return blanks.length;
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

// 정답표 칸: 문서에서 찾은 문항 번호(1., 2., …)로 「번호/정답」 두 줄 표를 문서 끝에 넣는다. 정답은 비워 둔다.
export function insertAnswerGrid(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), numbers = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const len = doc.getParagraphLength(sec, p), m = len ? /^\s*(\d{1,3})\./.exec(String(doc.getTextRange(sec, p, 0, len))) : null;
      if (m) numbers.push(Number(m[1]));
    }
  if (!numbers.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
  const sec = doc.getSectionCount() - 1, last = doc.getParagraphCount(sec) - 1, width = columnWidth(doc, sec);
  const perRow = 10, rows = [];
  for (let i = 0; i < numbers.length; i += perRow) {
    const chunk = numbers.slice(i, i + perRow);
    rows.push([...chunk.map(String), ...Array(perRow - chunk.length).fill('')], Array(perRow).fill(''));
  }
  bridge.transaction('answer-grid', () => {
    const end = doc.getParagraphLength(sec, last);
    parse(doc.splitParagraph(sec, last, end));
    doc.insertText(sec, last + 1, 0, '[정답]');
    parse(doc.splitParagraph(sec, last + 1, 4));
    insertTable(doc, { sectionIndex: sec, paragraphIndex: last + 2, charOffset: 0 }, rows.length, perRow, rows, new Map(), { width, border: 'Solid' });
    return true;
  });
  return numbers.length;
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

// 점검 더하기: 배점 합계·글꼴 섞임. [{text, at}]
export function extraChecks(doc) {
  const issues = [], scores = [], fonts = new Map();
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const len = doc.getParagraphLength(sec, p); if (!len) continue;
      const text = String(doc.getTextRange(sec, p, 0, len)), at = { sectionIndex: sec, paragraphIndex: p, charOffset: 0 };
      for (const m of text.matchAll(/\[(\d+(?:\.\d+)?)\s*점\]/g)) scores.push(Number(m[1]));
      if (/^\s*\d{1,3}\./.test(text)) {
        const c = parse(doc.getCharPropertiesAt(sec, p, Math.min(len - 1, 3)));
        const key = `${c.fontFamily} ${c.fontSize / 100}pt`;
        if (!fonts.has(key)) fonts.set(key, []);
        fonts.get(key).push(at);
      }
    }
  if (scores.length) {
    const total = Math.round(scores.reduce((a, b) => a + b, 0) * 10) / 10;
    if (total !== 100) issues.push({ text: `배점 합계가 ${total}점입니다(배점 표시 ${scores.length}곳 · 100점이 아님).`, at: null });
  }
  if (fonts.size > 1) {
    const [major] = [...fonts].sort((a, b) => b[1].length - a[1].length);
    for (const [key, ats] of fonts) if (key !== major[0]) issues.push({ text: `문항 첫 줄 글꼴이 다릅니다(${key} · 대부분은 ${major[0]}).`, at: ats[0] });
  }
  return issues;
}

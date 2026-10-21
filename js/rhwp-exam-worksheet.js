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

// ── 수업 자료 틀: 상자·답란·평가 기준표 ──
const LINE = { type: 1, width: 1, color: '#000000' }, NO_LINE = { type: 0, width: 0, color: '#000000' };
const mmUnits = mm => Math.round(mm * 7200 / 25.4);
// 커서 문단 뒤에 새 문단을 만들고 그 자리에 표를 넣는다(지금 글을 가르지 않게). 만든 표의 {para, ci}를 돌려준다.
function tableAfterCursor(bridge, doc, rows, cols, grid, options) {
  const pos = bridge.input.getCursorPosition();
  if (pos.cellPath?.length || bridge.input.cursor.isInCell?.()) throw new Error('표 밖 본문에 커서를 두고 누르세요.');
  const sec = pos.sectionIndex, para = pos.paragraphIndex;
  parse(doc.splitParagraph(sec, para, doc.getParagraphLength(sec, para)));
  const before = new Set();
  const tablesIn = p => { const out = []; for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if (c.type === 'table' && c.secIdx === sec && c.paraIdx === p && !(c.cellPath || []).length) out.push(c.controlIdx ?? c.ci); return out; };
  insertTable(doc, { sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 }, rows, cols, grid, new Map(), options);
  for (let p = para + 1; p < doc.getParagraphCount(sec); p++) { const found = tablesIn(p).filter(ci => !before.has(`${p}:${ci}`)); if (found.length) return { sec, para: p, ci: found[0] }; }
  throw new Error('표를 넣었지만 위치를 찾지 못했습니다.');
}
const setCell = (doc, t, cell, props) => doc.setCellProperties(t.sec, t.para, t.ci, cell, JSON.stringify(props));

export const BOX_PRESETS = [['개념 정리', '#eef2f7'], ['탐구 활동', '#eef6ee'], ['생각해 보기', '#fbf3e4'], ['주의', '#fbeaea']];
// 제목 줄(음영·굵게)과 내용 칸 하나로 된 상자.
export function insertBox(bridge, title = '개념 정리') {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), shade = (BOX_PRESETS.find(([t]) => t === title) || BOX_PRESETS[0])[1];
  bridge.transaction('insert-box', () => {
    const t = tableAfterCursor(bridge, doc, 2, 1, [[title], ['']], { width: columnWidth(doc), border: 'Solid', heights: [mmUnits(7), mmUnits(30)] });
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

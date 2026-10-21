// 학습지·시험지 만들기 도구(10-21 밤). 빈칸 학습지(표시 → 학생용 사본·정답 모음), 시험지 머리 양식, 정답표 칸, 문항 간격 일괄.
// 문서를 고치는 것은 모두 한 번의 되돌리기 단계(bridge.transaction). 학생용 사본은 지금 문서를 건드리지 않고 복사본에서 만든다.
import { insertTable } from './hwp-palette/native.js';
import { qrPng } from './qr-encode.js';
import { unitGapIssues } from './rhwp-exam-science-text.js';
import { columnWidth, questionBlocks, swapAdjacentQuestions, renumberDocument, allQuestionBlocks, splitQuestions, keepQuestionsWholeDoc, fillColumnsDoc, looksColumnFilled, topTables, blockLines, editLine, formatLine, lineCharProps } from './rhwp-exam-layout-tools.js';

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

// 본문 문단과 본문 표(한 겹) 칸에서 글자 속성이 test를 만족하는 구간을 문서 순서로 모은다. [{where, start, end, text, whole}]
// whole = 그 문단 글 전체가 구간인지(제목·머리 칸처럼 통째로 굵은 줄을 가릴 때 쓴다).
function collectRuns(doc, test) {
  const out = [];
  const scan = (length, propsAt, textOf, where) => {
    let start = -1;
    for (let i = 0; i <= length; i++) {
      const marked = i < length && test(propsAt(i));
      if (marked && start < 0) start = i;
      if (!marked && start >= 0) { out.push({ where, start, end: i, text: textOf(start, i), whole: textOf(0, length).trim() === textOf(start, i).trim() }); start = -1; }
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
export const collectBlanks = doc => collectRuns(doc, isBlank).map(({ whole, ...run }) => run);

// 굵은 글씨 → 빈칸: 개념 정리에서 굵게 한 핵심어를 한 번에 빈칸 표시로. 줄 전체가 굵은 제목·머리 칸과
// 문항 번호(「1.」), 기호·숫자뿐인 구간은 건너뛴다. 앞뒤 띄어쓰기는 빼고 표시한다. 표시한 낱말 수.
export function boldToBlanks(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle();
  const runs = collectRuns(doc, props => parse(props)?.bold === true && !isBlank(props))
    .filter(r => !r.whole && /[가-힣A-Za-z]/.test(r.text) && !/^\s*\d{1,3}\.\s*$/.test(r.text))
    .map(r => { const lead = r.text.length - r.text.trimStart().length, tail = r.text.length - r.text.trimEnd().length; return { ...r, start: r.start + lead, end: r.end - tail }; });
  if (!runs.length) throw new Error('빈칸으로 바꿀 굵은 낱말이 없습니다(줄 전체가 굵은 제목은 건너뜁니다).');
  bridge.transaction('bold-to-blanks', () => {
    for (const { where: w, start, end } of runs) {
      if (w.kind === 'body') doc.applyCharFormat(w.sec, w.para, start, end, JSON.stringify(BLANK_MARK));
      else doc.applyCharFormatInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, end, JSON.stringify(BLANK_MARK));
    }
    return true;
  });
  return runs.length;
}

// 빈칸 너비: 낱말 길이에 맞춰 전각 빈칸(최소 4칸). 학생이 손으로 쓸 자리.
export const blankText = word => `(${'　'.repeat(Math.max(4, Math.min(16, Math.round([...word.trim()].length * 1.6))))})`;

function replaceRange(doc, w, start, end, text, format = BLANK_CLEAR) {
  if (w.kind === 'body') {
    doc.deleteText(w.sec, w.para, start, end - start);
    doc.insertText(w.sec, w.para, start, text);
    doc.applyCharFormat(w.sec, w.para, start, start + [...text].length, JSON.stringify(format));
  } else {
    doc.deleteTextInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, end - start);
    doc.insertTextInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, text);
    doc.applyCharFormatInCell(w.sec, w.para, w.ci, w.cell, w.cp, start, start + [...text].length, JSON.stringify(format));
  }
}
// 정답지 사본: 빈칸 자리에 「( 정답 )」을 빨간 굵은 글씨로. 지금 문서는 그대로.
export function answerKeyCopy(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blanks = collectBlanks(doc);
  if (!blanks.length) throw new Error('빈칸으로 표시한 낱말이 없습니다. 낱말을 고르고 「빈칸 표시」를 누르세요.');
  const Document = doc.constructor, copy = new Document(doc.exportHwpx());
  try {
    for (const blank of [...blanks].reverse()) replaceRange(copy, blank.where, blank.start, blank.end, `( ${blank.text.trim()} )`, { ...BLANK_CLEAR, textColor: '#d0021b', bold: true });
    return { bytes: copy.exportHwpx(), count: blanks.length };
  } finally { copy.free(); }
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
  const count = parse(doc.getTableDimensions(sec, para, ci)).cellCount, heads = [];
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

// 학생용 사본: 지금 문서를 복사해 빈칸 표시 낱말을 「(　　　)」로 바꾼 HWPX 바이트. 지금 문서는 그대로다.
// 교사만 보는 줄: 「[정답] …」「정답: …」「[해설]」「[풀이]」「[채점 기준]」「[교사용]」「[출처]」「[메모]」, 이 도구가 붙인 「[빈칸 정답]」「[나형 대응]」.
export const TEACHER_ONLY = /^\s*(?:[\[【〈<(]\s*(?:정답|해설|풀이|채점\s*기준|교사용|출처|메모|성취기준|난이도|내용\s*영역|빈칸 정답|나형 대응|나형 정답)\s*[\]】〉>)]|(?:정답|해설|풀이)\s*[:：])/;
function hasTopTable(doc, sec, para) {
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if (c.type === 'table' && !c.cellPath?.length && (c.secIdx ?? 0) === sec && c.paraIdx === para) return true;
  return false;
}
export function studentCopy(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blanks = collectBlanks(doc), teacher = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let p = 0; p < doc.getParagraphCount(sec); p++) {
      const text = String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
      if (!TEACHER_ONLY.test(text)) continue;
      // 「정답표 칸」이 넣은 「[정답]」 머리 바로 다음 문단의 표(정답표)도 함께 뺀다.
      const gridAfter = /^\s*\[정답\]\s*$/.test(text) && p + 1 < doc.getParagraphCount(sec) && hasTopTable(doc, sec, p + 1);
      teacher.push({ sec, p, gridAfter });
    }
  if (!blanks.length && !teacher.length) throw new Error('빈칸으로 표시한 낱말이나 「[정답]·[해설]」 줄이 없습니다. 낱말을 고르고 「빈칸 표시」를 누르세요.');
  const Document = doc.constructor, copy = new Document(doc.exportHwpx());
  try {
    // 같은 문단 안에서는 뒤에서부터 바꿔야 앞 구간 위치가 그대로다.
    for (const blank of [...blanks].reverse()) replaceRange(copy, blank.where, blank.start, blank.end, blankText(blank.text));
    // 교사용 줄은 뒤에서부터 문단째 뺀다(0번 문단은 구역 설정을 품어 글만 지운다).
    for (const { sec, p, gridAfter } of [...teacher].reverse()) {
      if (gridAfter) {
        // 정답표를 문서 끝에 넣을 때 생긴 표 뒤 빈 문단도 함께 뺀다.
        const n = copy.getParagraphCount(sec);
        if (p + 2 === n - 1 && !copy.getParagraphLength(sec, p + 2)) parse(copy.deleteParagraph(sec, p + 2));
        parse(copy.deleteParagraph(sec, p + 1));
      }
      if (p > 0) parse(copy.deleteParagraph(sec, p));
      else { const n = copy.getParagraphLength(sec, 0); if (n) copy.deleteText(sec, 0, 0, n); }
    }
    // 교사용 줄이 빠지면 쪽 배치가 달라진다 — 교사용에서 맞춰 둔 판(나뉜 문항 없음, 단 채우기)을 학생용에서도 다시 맞춘다.
    let relaid = 0, refilled = false;
    if (teacher.length) {
      if (!splitQuestions(doc).length && splitQuestions(copy).length) relaid = keepQuestionsWholeDoc(copy).moved;
      if (looksColumnFilled(doc)) { fillColumnsDoc(copy); refilled = true; }
    }
    return { bytes: copy.exportHwpx(), count: blanks.length, removed: teacher.length, relaid, refilled, answers: blanks.map(b => b.text) };
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
// 문항과 그 안의 줄(본문·표 칸) — 표 하나로 된 학교 시험 문항도 칸 글을 읽는다.
function blocksWithLines(doc) {
  const tables = topTables(doc), out = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const q of questionBlocks(doc, sec, tables)) out.push({ ...q, sec, lines: blockLines(doc, sec, q, tables) });
  return out;
}
// 문항마다 적어 둔 정답: 문항 안의 「[정답] ③」「정답: ③」 줄. Map(번호 → 정답 글).
const ANSWER_LINE = /^\s*(?:[\[【]\s*정답\s*[\]】]|정답\s*[:：])\s*(\S.*)$/;
export function questionAnswers(doc) {
  const out = new Map();
  for (const q of blocksWithLines(doc)) {
    if (q.essay) continue;
    for (const { text } of q.lines) { const m = ANSWER_LINE.exec(text); if (m) { out.set(q.number, m[1].trim()); break; } }
  }
  return out;
}
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
  // 문항 안에 「[정답] ③」을 적어 두었으면 정답 줄을 채운다.
  const answers = questionAnswers(doc), perRow = 10, rows = [];
  for (let i = 0; i < numbers.length; i += perRow) {
    const chunk = numbers.slice(i, i + perRow);
    rows.push([...chunk.map(String), ...Array(perRow - chunk.length).fill('')], [...chunk.map(n => answers.get(n) || ''), ...Array(perRow - chunk.length).fill('')]);
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

// 배점: 커서가 있는 문항의 [n점]을 넣거나 바꾼다(score=null이면 지움). 자리는 발문 끝(「?」로 끝나는 마지막 문단), 없으면 문항 첫 문단 끝.
// {number, total, count} — total은 문서 전체 배점 합계.
export const SCORE_CHOICES = [2, 2.5, 3, 3.5, 4, 5];
// 배점 표시: 평가원 「[3점]」과 학교 시험 「(3점)」 둘 다.
const SCORE_MARK = /\s?[\[(]\d+(?:\.\d+)?\s*점[\])]/g;
export const SCORE_VALUE = /[\[(](\d+(?:\.\d+)?)\s*점[\])]/;
const SCORE_VALUES = new RegExp(SCORE_VALUE.source, 'g');
export function setQuestionScore(bridge, score) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle();
  const at = input.cursor.getPosition(), sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
  const tables = topTables(doc), q = questionBlocks(doc, sec, tables).find(b => b.start <= para && para < b.end);
  if (!q) throw new Error('배점을 넣을 문항 안(「1.」로 시작하는 문항)에 커서를 두세요.');
  const lines = blockLines(doc, sec, q, tables).filter(l => !TEACHER_ONLY.test(l.text));
  // 괄호 모양: 이 문항에 있던 모양, 없으면 문서에서 더 많이 쓴 모양(평가원 [3점] / 학교 (3점)).
  let paren = null, round = 0, square = 0;
  for (const l of lines) { const m = SCORE_VALUE.exec(l.text); if (m) { paren = m[0][0] === '('; break; } }
  if (paren === null) {
    for (const b of blocksWithLines(doc)) for (const l of b.lines) for (const m of l.text.matchAll(SCORE_VALUES)) m[0][0] === '(' ? round++ : square++;
    paren = round > square;
  }
  // 넣을 자리: 「?」로 끝나는 마지막 줄(배점 표시를 뺀 글 기준), 없으면 표 문항은 발문 칸(둘째 칸), 글 문항은 번호 줄.
  const bare = t => t.replace(SCORE_MARK, '');
  let target = lines.filter(l => /\?\s*$/.test(bare(l.text))).at(-1)?.where;
  if (!target) target = q.cell ? { kind: 'cell', sec, p: q.head, ci: q.cell.ci, cell: 1, cp: 0 } : { kind: 'body', sec, p: q.head };
  const lineText = w => (w.kind === 'body' ? String(doc.getTextRange(sec, w.p, 0, doc.getParagraphLength(sec, w.p))) : String(doc.getTextInCell(sec, w.p, w.ci, w.cell, w.cp, 0, doc.getCellParagraphLength(sec, w.p, w.ci, w.cell, w.cp))));
  bridge.transaction('question-score', () => {
    for (const l of lines) for (const m of [...lineText(l.where).matchAll(SCORE_MARK)].reverse()) editLine(doc, l.where, m.index, m[0].length);
    if (score != null) {
      const text = lineText(target), trimmed = text.replace(/\s+$/, '');
      if (trimmed.length < text.length) editLine(doc, target, trimmed.length, text.length - trimmed.length);
      editLine(doc, target, trimmed.length, 0, paren ? ` (${score}점)` : ` [${score}점]`);
    }
    return true;
  });
  let total = 0, count = 0;
  for (const b of blocksWithLines(doc)) for (const l of b.lines) for (const m of l.text.matchAll(SCORE_VALUES)) { total += Number(m[1]); count++; }
  return { number: q.number, label: q.label, total: Math.round(total * 10) / 10, count };
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

// 정답 넣기: 커서가 있는 선택형 문항 끝에 「[정답] ③」 줄을 넣거나 바꾼다(mark=null이면 그 줄을 지움). 빨간 글씨, 학생용에서는 빠진다.
export function setQuestionAnswer(bridge, mark) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle();
  const at = input.cursor.getPosition(), sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
  const q = questionBlocks(doc, sec).find(b => b.start <= para && para < b.end);
  if (!q) throw new Error('정답을 넣을 문항 안에 커서를 두세요.');
  if (q.essay) throw new Error('서술형은 「[정답]」 대신 「[채점 기준]」 상자나 평가 기준표를 쓰세요.');
  const textOf = p => String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
  let line = -1; for (let p = q.head; p < q.end; p++) if (ANSWER_LINE.test(textOf(p))) { line = p; break; }
  const text = mark ? `[정답] ${mark}` : '';
  bridge.transaction('question-answer', () => {
    if (line >= 0 && !mark) {
      if (line > 0) parse(doc.deleteParagraph(sec, line)); else doc.deleteText(sec, 0, 0, doc.getParagraphLength(sec, 0));
    } else if (line >= 0) {
      doc.deleteText(sec, line, 0, doc.getParagraphLength(sec, line)); doc.insertText(sec, line, 0, text);
      doc.applyCharFormat(sec, line, 0, [...text].length, JSON.stringify({ textColor: '#d0021b', bold: true }));
    } else if (mark) {
      // 문항 마지막 문단 뒤에 새 줄(빈 줄이 끝에 있으면 그 줄을 쓴다).
      let p = q.end - 1;
      if (doc.getParagraphLength(sec, p) || p === q.head) { parse(doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p))); p++; }
      doc.insertText(sec, p, 0, text);
      doc.applyCharFormat(sec, p, 0, [...text].length, JSON.stringify({ textColor: '#d0021b', bold: true }));
    }
    return true;
  });
  return { label: q.label, mark };
}

// 해설 줄: 커서 문항 끝에 「[해설] 」 줄을 만들고(이미 있으면 그 줄로) 커서를 그 끝에 둔다. 학생용에서 빠지고 정답·해설지에 모인다.
export function addExplanationLine(bridge) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle();
  const at = input.cursor.getPosition(), sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
  const q = questionBlocks(doc, sec).find(b => b.start <= para && para < b.end);
  if (!q) throw new Error('해설을 달 문항 안에 커서를 두세요.');
  const textOf = p => String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
  let line = -1; for (let p = q.head; p < q.end; p++) if (/^\s*(?:[\[【]\s*(?:해설|풀이)\s*[\]】]|(?:해설|풀이)\s*[:：])/.test(textOf(p))) { line = p; break; }
  if (line < 0) bridge.transaction('explanation-line', () => {
    let p = q.end - 1;
    if (doc.getParagraphLength(sec, p) || p === q.head) { parse(doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p))); p++; }
    doc.insertText(sec, p, 0, '[해설] ');
    doc.applyCharFormat(sec, p, 0, 5, JSON.stringify({ textColor: '#3a5a8c', bold: false }));
    line = p; return true;
  });
  input.cursor.moveTo({ sectionIndex: sec, paragraphIndex: line, charOffset: doc.getParagraphLength(sec, line) }); input.updateCaret?.();
  return q.label;
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

// 문서 요약(점검 창 맨 위 한 줄): 문항 수(선택형·서술형), 쪽 수, 배점 합계, 정답 분포.
export function examSummary(doc) {
  const blocks = blocksWithLines(doc), essay = blocks.filter(b => b.essay).length;
  let total = 0, scored = 0;
  for (const q of blocks) { const m = q.lines.map(l => SCORE_VALUE.exec(l.text)).find(Boolean); if (m) { total += Number(m[1]); scored++; } }
  const counts = [0, 0, 0, 0, 0]; let answered = 0;
  for (const [, a] of questionAnswers(doc)) { const i = MARKS.indexOf(a.trim()[0]); if (i >= 0) { counts[i]++; answered++; } }
  const parts = [`문항 ${blocks.length}${essay ? `(선택형 ${blocks.length - essay}·서술형 ${essay})` : ''}`, `${doc.pageCount()}쪽`];
  if (scored) parts.push(`배점 ${Math.round(total * 10) / 10}점`);
  if (answered) parts.push(`정답 ${counts.map((c, i) => `${MARKS[i]}${c}`).join(' ')}`);
  return blocks.length ? parts.join(' · ') : '';
}

// 분류 정보: 커서 문항 끝에 「[내용 영역] …」「[성취기준] …」「[난이도] 상·중·하」 줄을 넣거나 바꾼다(빈 값이면 그 줄을 뺌). 학생용에서 빠진다.
const META_KEYS = [['area', '내용 영역'], ['standard', '성취기준'], ['level', '난이도']];
export function questionMeta(doc, sec, q) {
  const out = {};
  for (let p = q.head; p < q.end; p++) {
    const m = /^\s*[\[【]\s*(내용\s*영역|성취기준|난이도)\s*[\]】]\s*(.*)$/.exec(String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p))));
    if (m) out[META_KEYS.find(([, name]) => name.replace(/\s/g, '') === m[1].replace(/\s/g, ''))[0]] = { p, value: m[2].trim() };
  }
  return out;
}
export function cursorQuestion(bridge) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle(), at = input.cursor.getPosition();
  const sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
  const q = questionBlocks(doc, sec).find(b => b.start <= para && para < b.end);
  return q ? { doc, sec, q } : null;
}
export function setQuestionMeta(bridge, values) {
  const found = cursorQuestion(bridge); if (!found) throw new Error('분류 정보를 넣을 문항 안에 커서를 두세요.');
  const { doc, sec, q } = found;
  bridge.transaction('question-meta', () => {
    for (const [key, name] of META_KEYS) {
      if (!(key in values)) continue;
      const value = String(values[key] || '').trim(), block = questionBlocks(doc, sec).find(b => b.head === q.head) || q, now = questionMeta(doc, sec, block)[key];
      const text = `[${name}] ${value}`;
      if (now && !value) { parse(doc.deleteParagraph(sec, now.p)); continue; }
      if (!value) continue;
      let p = now?.p;
      if (p === undefined) { p = block.end - 1; if (doc.getParagraphLength(sec, p) || p === block.head) { parse(doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p))); p++; } }
      else doc.deleteText(sec, p, 0, doc.getParagraphLength(sec, p));
      doc.insertText(sec, p, 0, text);
      doc.applyCharFormat(sec, p, 0, [...text].length, JSON.stringify({ textColor: '#3a5a8c', bold: false }));
    }
    return true;
  });
  return q.label;
}

// 점검 더하기: 배점 합계·글꼴 섞임. [{text, at}]
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
  // 배점: 문항 안(본문·표 칸) 「[3점]」「(3점)」.
  const scores = blocks.flatMap(q => q.lines.flatMap(l => [...l.text.matchAll(SCORE_VALUES)].map(m => Number(m[1]))));
  if (scores.length) {
    const total = Math.round(scores.reduce((a, b) => a + b, 0) * 10) / 10;
    if (total !== 100) issues.push({ text: `배점 합계가 ${total}점입니다(배점 표시 ${scores.length}곳 · 100점이 아님).`, at: null });
  }
  // 배점 빠진 문항: 배점을 단 문항이 있는데 안 단 선택형·서술형 문항이 있으면 알린다.
  if (scores.length) for (const q of blocks) if (!q.lines.some(l => SCORE_VALUE.test(l.text))) issues.push({ text: `${q.label} 문항에 배점(n점)이 없습니다.`, at: { sectionIndex: q.sec, paragraphIndex: q.head, charOffset: 0 } });
  // 정답 분포: 문항 안 「[정답] ③」이 다섯 개 이상이면 번호별 개수와 같은 정답 연속을 본다.
  const answers = [...questionAnswers(doc)].sort((a, b) => a[0] - b[0]).map(([n, a]) => [n, MARKS.indexOf(a.trim()[0])]).filter(([, i]) => i >= 0);
  if (answers.length >= 5) {
    const counts = [0, 0, 0, 0, 0]; for (const [, i] of answers) counts[i]++;
    const mean = answers.length / 5, line = counts.map((c, i) => `${MARKS[i]}${c}`).join(' ');
    if (counts.some(c => Math.abs(c - mean) > Math.max(2, mean * 0.5))) issues.push({ text: `정답 분포가 고르지 않습니다(${line}).`, at: null });
    // 같은 정답이 세 문항 이상 잇달아 나오면 그 범위 전체를 알린다.
    for (let i = 0, from = 0; i <= answers.length; i++) {
      const same = i < answers.length && i > from && answers[i][1] === answers[i - 1][1] && answers[i][0] === answers[i - 1][0] + 1;
      if (same) continue;
      if (i - from >= 3) issues.push({ text: `같은 정답 ${MARKS[answers[from][1]]}이 ${answers[from][0]}~${answers[i - 1][0]}번에 잇달아 나옵니다.`, at: null });
      from = i;
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
  parse(doc.splitParagraph(sec, para, doc.getParagraphLength(sec, para)));
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
// QR 코드: 커서 문단 뒤에 테두리 없는 1×2 칸 — 왼쪽 QR 그림(sizeMm), 오른쪽 안내 글과 주소. 주소는 그대로 QR에 담는다.
export async function insertQrCode(bridge, { url, label = '', sizeMm = 25 } = {}) {
  requireInput(bridge);
  const text = String(url || '').trim();
  if (!text) throw new Error('QR 코드에 넣을 주소(또는 글)를 쓰세요.');
  if (!(sizeMm >= 15 && sizeMm <= 60)) throw new Error('QR 코드 크기는 15~60mm로 고르세요.');
  const png = await qrPng(text, { ecc: 'M', cell: 8 });
  const doc = bridge.wasm.borrowDocumentHandle(), wasm = bridge.wasm;
  const assets = new Map([['qr', { bytes: png.bytes, widthMm: sizeMm, heightMm: sizeMm, width: png.width, height: png.height, extension: 'png', name: 'qr.png' }]]);
  const shown = text.length > 70 ? `${text.slice(0, 67)}…` : text, title = String(label || '').trim() || '스캔해서 보기';
  bridge.transaction('insert-qr', () => {
    const width = columnWidth(doc), left = Math.min(width - mmUnits(30), mmUnits(sizeMm + 5));
    const t = tableAfterCursor(bridge, doc, 1, 2, [[[{ image: 'qr' }], { kind: 'multiline', lines: [title, shown] }]], { width, border: 'None', assets });
    const cells = [0, 1].map(c => parse(wasm.getCellProperties(t.sec, t.para, t.ci, c)).width);
    parse(wasm.resizeTableCells(t.sec, t.para, t.ci, [{ cellIdx: 0, widthDelta: left - cells[0] }, { cellIdx: 1, widthDelta: (width - left) - cells[1] }]));
    doc.applyCharFormatInCell(t.sec, t.para, t.ci, 1, 0, 0, [...title].length, JSON.stringify({ bold: true }));
    return true;
  });
  return { version: png.version, title };
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

// ── 판짜기: 단·용지·가나형 ──
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
// 나형 만들기: 문항 순서를 섞은 사본(번호 다시 매김)과 「나형 번호 → 가형 번호」 대응. 지금 문서는 그대로.
export function makeVariant(bridge, random = Math.random, { choices = false } = {}) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle();
  // 문항이 가장 많은 구역(보통 2단 본문)만 섞는다 — 머리 구역의 안내문은 그대로.
  let mainSec = 0; for (let s = 1; s < doc.getSectionCount(); s++) if (questionBlocks(doc, s).length > questionBlocks(doc, mainSec).length) mainSec = s;
  const first = questionBlocks(doc, mainSec);
  // 묶음 문항([1~2])·서술형은 제자리에 두고, 그 사이사이 이어진 낱개 선택형 문항끼리만 섞는다.
  const segments = []; let run = [];
  first.forEach((b, i) => { if (b.group || b.essay) { if (run.length) segments.push(run); run = []; } else run.push(i); });
  if (run.length) segments.push(run);
  if (!segments.some(seg => seg.length > 1)) throw new Error('섞을 수 있는 낱개 문항이 둘 이상 이어져 있어야 합니다(묶음 문항은 제자리).');
  // 원래 자리와 다른 순서가 나올 때까지 섞는다(문항이 둘이면 서로 바꾼다).
  const order = first.map((_, i) => i);
  for (let tries = 0; tries < 20 && order.every((v, i) => v === i); tries++)
    for (const seg of segments) for (let k = seg.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [order[seg[k]], order[seg[j]]] = [order[seg[j]], order[seg[k]]]; }
  const Document = doc.constructor, copy = new Document(doc.exportHwpx());
  try {
    // 인접 바꾸기로 목표 순서를 만든다(선택 정렬). current[k] = 지금 k번째 자리에 있는 원래 문항.
    const current = first.map((_, i) => i);
    for (let target = 0; target < order.length; target++) {
      let at = current.indexOf(order[target]);
      while (at > target) { swapAdjacentQuestions(copy, mainSec, questionBlocks(copy, mainSec), at - 1); [current[at - 1], current[at]] = [current[at], current[at - 1]]; at--; }
    }
    renumberDocument(copy);
    const shuffled = choices ? shuffleChoices(copy, mainSec, random) : 0;
    const final = questionBlocks(copy, mainSec), answers = questionAnswers(copy);
    return { bytes: copy.exportHwpx(), shuffled, mapping: order.map((orig, i) => ({ variant: final[i]?.number ?? i + 1, original: first[orig].number, answer: answers.get(final[i]?.number) || '' })) };
  } finally { copy.free(); }
}
// 선지 섞기(나형 사본에만): 한 문단에 하나씩인 선지는 문단째(서식 그대로), 3열·5열 선지 표는 칸 글을 섞고 ①부터 다시 붙인다.
// 문항 안 「[정답] ③」도 바뀐 자리로 고친다. ㄱㄴㄷ·A B C 조합 선지(차례가 관례)와 첨자 등 서식이 섞인 표 칸은 그대로 둔다. 섞은 문항 수.
const MARKS = '①②③④⑤';
function shuffleChoices(doc, sec, random, choose = null) {
  const textOf = p => String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
  const markAt = p => { const t = textOf(p), i = t.search(/\S/); return i < 0 ? null : { i, mark: t[i], rest: t.slice(i + 1) }; };
  const randomPerm = n => {
    const perm = [...Array(n).keys()];
    for (let tries = 0; tries < 20 && perm.every((v, i) => v === i); tries++) for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    return perm.every((v, i) => v === i) ? null : perm;
  };
  // k번째 문항의 정답 자리(0~4, 없으면 -1)
  const answerIndex = k => {
    const q = questionBlocks(doc, sec)[k];
    for (let p = q.head; p < q.end; p++) { const m = ANSWER_LINE.exec(textOf(p)); if (m) return MARKS.indexOf(m[1].trim()[0]); }
    return -1;
  };
  const pick = (k, n) => (choose ? choose(k, n, answerIndex(k)) : randomPerm(n));
  // 문항 안 「[정답] ③」을 섞인 자리로 고친다.
  const fixAnswer = (k, perm, n) => {
    const after = questionBlocks(doc, sec)[k];
    for (let p = after.head; p < after.end; p++) {
      const t = textOf(p), m = ANSWER_LINE.exec(t); if (!m) continue;
      const at = t.length - m[1].length + m[1].search(/[①-⑤]/), old = MARKS.indexOf(t[at]);
      if (m[1].search(/[①-⑤]/) >= 0 && old >= 0 && old < n) { doc.deleteText(sec, p, at, 1); doc.insertText(sec, p, at, MARKS[perm.indexOf(old)]); }
      break;
    }
  };
  // 문단마다 본문 표(한 겹) — 표 칸 글만 바꾸므로 문단 번호는 그대로다.
  const tablesAt = new Map();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || [])
    if (c.type === 'table' && (c.secIdx ?? 0) === sec && !c.cellPath?.length) { const list = tablesAt.get(c.paraIdx) || []; const ci = c.controlIdx ?? c.ci; if (!list.includes(ci)) list.push(ci); tablesAt.set(c.paraIdx, list); }
  const COMBO = /^[ㄱ-ㅎA-E](?:\s*,\s*[ㄱ-ㅎA-E])*$/;
  // 3열·5열 선지 표: 칸마다 「①…」 하나, 순서대로, 나머지 칸은 비고, 칸 안 글자 모양이 한 가지(첨자 등이 섞이면 글만 바꿀 수 없어 건너뜀).
  const tableChoices = (p, ci) => {
    const cells = parse(doc.getTableDimensions(sec, p, ci)).cellCount, choice = [];
    for (let cell = 0; cell < cells; cell++) {
      if (doc.getCellParagraphCount(sec, p, ci, cell) !== 1) return null;
      const len = doc.getCellParagraphLength(sec, p, ci, cell, 0), t = String(doc.getTextInCell(sec, p, ci, cell, 0, 0, len)).trim();
      if (!t) continue;
      if (t[0] !== MARKS[choice.length] || /[①-⑤]/.test(t.slice(1))) return null;
      const shape = parse(doc.getCellCharPropertiesAt(sec, p, ci, cell, 0, 0)).charShapeId;
      for (let o = 1; o < len; o++) if (parse(doc.getCellCharPropertiesAt(sec, p, ci, cell, 0, o)).charShapeId !== shape) return null;
      choice.push({ cell, len, content: t.slice(1).trim() });
    }
    return choice.length >= 3 && !choice.every(c => COMBO.test(c.content)) ? choice : null;
  };
  let count = 0;
  for (let k = 0; k < questionBlocks(doc, sec).length; k++) {
    const b = questionBlocks(doc, sec)[k];
    let from = -1;
    for (let p = b.head + 1; p < b.end; p++) if (markAt(p)?.mark === MARKS[0]) { from = p; break; }
    if (from >= 0) {
      // 한 문단에 선지 하나씩: 문단째 옮긴다(서식 그대로).
      let n = 0;
      while (n < MARKS.length && from + n < b.end) { const m = markAt(from + n); if (m?.mark !== MARKS[n] || /[①-⑤]/.test(m.rest)) break; n++; }
      if (n < 3 || (from + n < b.end && /^[①-⑤]/.test(markAt(from + n)?.mark || ''))) continue;
      if ([...Array(n).keys()].every(i => COMBO.test(markAt(from + i).rest.trim()))) continue;
      const perm = pick(k, n); if (!perm) continue;
      const current = [...Array(n).keys()];
      for (let target = 0; target < n; target++) {
        let at = current.indexOf(perm[target]);
        while (at > target) { swapAdjacentQuestions(doc, sec, [{ start: from + at - 1, end: from + at }, { start: from + at, end: from + at + 1 }], 0); [current[at - 1], current[at]] = [current[at], current[at - 1]]; at--; }
      }
      for (let i = 0; i < n; i++) { const m = markAt(from + i); if (m.mark !== MARKS[i]) { doc.deleteText(sec, from + i, m.i, 1); doc.insertText(sec, from + i, m.i, MARKS[i]); } }
      fixAnswer(k, perm, n); count++;
      continue;
    }
    // 선지 표: 칸 글을 섞어 다시 쓴다.
    let found = null;
    for (let p = b.head; p < b.end && !found; p++) for (const ci of tablesAt.get(p) || []) { const c = tableChoices(p, ci); if (c) { found = { p, ci, choice: c }; break; } }
    if (!found) continue;
    const n = found.choice.length, perm = pick(k, n); if (!perm) continue;
    found.choice.forEach((c, i) => {
      const text = `${MARKS[i]} ${found.choice[perm[i]].content}`;
      doc.deleteTextInCell(sec, found.p, found.ci, c.cell, 0, 0, c.len);
      doc.insertTextInCell(sec, found.p, found.ci, c.cell, 0, 0, text);
    });
    fixAnswer(k, perm, n); count++;
  }
  return count;
}
// 정답 분포 고르게: 정답이 몰린 번호의 문항에서 선지 두 개(정답 ↔ 가장 덜 쓰인 번호)만 맞바꾸고 [정답]을 따라 고친다.
// 선지를 옮길 수 있는 문항(한 줄에 하나씩·3/5열 표, ㄱㄴㄷ 조합 제외)만. 같은 정답이 세 번 잇달지 않게 고른다. {changed, counts}
export function balanceAnswers(bridge) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), counts = [0, 0, 0, 0, 0];
  for (const [, a] of questionAnswers(doc)) { const i = MARKS.indexOf(a.trim()[0]); if (i >= 0) counts[i]++; }
  if (counts.reduce((a, b) => a + b, 0) < 5) throw new Error('문항 안 「[정답] ③」이 다섯 개 이상 있어야 분포를 맞출 수 있습니다.');
  const recent = []; let changed = 0;
  const choose = (k, n, a) => {
    if (a < 0 || a >= n) return null;
    const blocked = recent.length >= 2 && recent.at(-1) === recent.at(-2) ? recent.at(-1) : -1;
    let target = a;
    for (let t = 0; t < n; t++) if (t !== blocked && (counts[t] < counts[target] - 1 || (target === blocked && t !== blocked))) target = t;
    if (target === a) { recent.push(a); return null; }
    const perm = [...Array(n).keys()]; perm[target] = a; perm[a] = target;
    counts[a]--; counts[target]++; recent.push(target); changed++;
    return perm;
  };
  bridge.transaction('balance-answers', () => { for (let sec = 0; sec < doc.getSectionCount(); sec++) shuffleChoices(doc, sec, Math.random, choose); return true; });
  return { changed, counts };
}
// 교사용 문서 끝에 「[나형 대응] 나1=가3 …」을 붙인다.
export function appendVariantMapping(bridge, mapping) {
  const doc = bridge.wasm.borrowDocumentHandle(), sec = doc.getSectionCount() - 1, last = doc.getParagraphCount(sec) - 1;
  const line = `[나형 대응] ${mapping.map(m => `나${m.variant}=가${m.original}`).join('  ')}`;
  // 문항 안에 정답을 적어 두었으면 나형 정답도 한 줄 더(선지를 섞었으면 바뀐 번호).
  const key = mapping.some(m => m.answer) ? `[나형 정답] ${mapping.map(m => `${m.variant}-${m.answer || '?'}`).join('  ')}` : '';
  bridge.transaction('variant-mapping', () => {
    parse(doc.splitParagraph(sec, last, doc.getParagraphLength(sec, last)));
    doc.insertText(sec, last + 1, 0, line);
    if (key) { parse(doc.splitParagraph(sec, last + 1, [...line].length)); doc.insertText(sec, last + 2, 0, key); }
    return true;
  });
  return key ? `${line} / ${key}` : line;
}

// 학습지 틀: 제목·「학년 반 번 이름」 칸·학습 목표·활동 1·활동 2·정리를 문서 끝에 한 번에.
// 틀 종류: [제목 기본값, [칸 이름, 머리 음영, 칸 높이(mm)]…]
export const WORKSHEET_FRAMES = {
  lesson: ['학습지', '수업 학습지', [['학습 목표', '#eef2f7', 14], ['활동 1', '#eef6ee', 45], ['활동 2', '#eef6ee', 45], ['정리', '#fbf3e4', 30]]],
  lab: ['실험 보고서', '실험 보고서', [['탐구 주제', '#eef2f7', 10], ['가설', '#eef2f7', 14], ['준비물', '#eef6ee', 14], ['실험 과정', '#eef6ee', 40], ['결과', '#fbf3e4', 35], ['결론 및 토의', '#fbf3e4', 30]]],
  check: ['형성 평가', '형성 평가', [['확인 문제', '#eef2f7', 90], ['스스로 평가 (잘함 · 보통 · 노력)', '#fbf3e4', 14]]],
};
export function insertWorksheetFrame(bridge, title = '', kind = 'lesson') {
  requireInput(bridge);
  const frame = WORKSHEET_FRAMES[kind]; if (!frame) throw new Error('학습지 틀 종류를 다시 고르세요.');
  title = title || frame[0];
  const doc = bridge.wasm.borrowDocumentHandle(), sec = doc.getSectionCount() - 1, width = columnWidth(doc, sec);
  const sections = frame[2];
  bridge.transaction('worksheet-frame', () => {
    const last = doc.getParagraphCount(sec) - 1, startEmpty = doc.getParagraphCount(sec) === 1 && !doc.getParagraphLength(sec, 0);
    let p = startEmpty ? 0 : (parse(doc.splitParagraph(sec, last, doc.getParagraphLength(sec, last))), last + 1);
    doc.insertText(sec, p, 0, title);
    doc.applyCharFormat(sec, p, 0, [...title].length, JSON.stringify({ bold: true, fontSize: 1600 }));
    doc.applyParaFormat(sec, p, JSON.stringify({ alignment: 'center' }));
    parse(doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p))); p++;
    insertTable(doc, { sectionIndex: sec, paragraphIndex: p, charOffset: 0 }, 1, 4, [['   학년', '   반', '   번', '이름:']], new Map(), { width, border: 'Solid' });
    for (const [label, shade, height] of sections) {
      p = doc.getParagraphCount(sec) - 1;
      if (doc.getParagraphLength(sec, p)) { parse(doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p))); p++; }
      insertTable(doc, { sectionIndex: sec, paragraphIndex: p, charOffset: 0 }, 2, 1, [[label], ['']], new Map(), { width, border: 'Solid', heights: [mmUnits(7), mmUnits(height)] });
      const controls = []; for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if (c.type === 'table' && c.secIdx === sec && c.paraIdx === p && !(c.cellPath || []).length) controls.push(c.controlIdx ?? c.ci);
      const ci = controls.at(-1);
      if (ci !== undefined) {
        doc.setCellProperties(sec, p, ci, 0, JSON.stringify({ fillType: 'solid', fillColor: shade }));
        doc.applyCharFormatInCell(sec, p, ci, 0, 0, 0, [...label].length, JSON.stringify({ bold: true }));
      }
    }
    return true;
  });
  return sections.length;
}

// 이원목적분류표: 문항마다 번호·배점([n점])·정답([정답] ③)과, 문항 안에 적어 둔 [내용 영역]·[성취기준]·[난이도]를 채운 표를 새 한글 문서로.
// 지금 문서는 그대로. {bytes, count, total}
export const BLUEPRINT_HEAD = ['문항', '내용 영역', '성취기준', '난이도', '배점', '정답', '비고'];
const BLUEPRINT_RATIO = [8, 18, 40, 9, 8, 8, 9];
export function blueprintCopy(bridge, title = '시험') {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blocks = blocksWithLines(doc);
  if (!blocks.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
  const answers = questionAnswers(doc), rows = [BLUEPRINT_HEAD];
  let total = 0;
  for (const q of blocks) {
    const sm = q.lines.map(l => SCORE_VALUE.exec(l.text)).find(Boolean), score = sm ? sm[1] : '';
    total += Number(score) || 0;
    // 문항 안 「[내용 영역] …」「[성취기준] …」「[난이도] 상·중·하」 줄이 있으면 채운다(학생용에서는 빠지는 교사용 줄).
    const meta = {};
    for (const { text } of q.lines) { const m = /^\s*[\[【]\s*(내용\s*영역|성취기준|난이도)\s*[\]】]\s*(.*)$/.exec(text); if (m) meta[m[1].replace(/\s+/g, '')] = m[2].trim(); }
    rows.push([q.essay ? q.label : String(q.number), meta['내용영역'] || '', meta['성취기준'] || '', meta['난이도'] || '', score, q.essay ? '' : (answers.get(q.number) || ''), '']);
  }
  rows.push(['합계', '', '', '', String(Math.round(total * 10) / 10), '', '']);
  const Document = doc.constructor, out = Document.createEmpty();
  try {
    out.createBlankDocument();
    const name = `${String(title || '시험').trim()} 이원목적분류표`;
    out.insertText(0, 0, 0, name);
    out.applyCharFormat(0, 0, 0, [...name].length, JSON.stringify({ bold: true, fontSize: 1500 }));
    out.applyParaFormat(0, 0, JSON.stringify({ alignment: 'center' }));
    parse(out.splitParagraph(0, 0, out.getParagraphLength(0, 0)));
    const width = columnWidth(out, 0), cols = BLUEPRINT_HEAD.length;
    insertTable(out, { sectionIndex: 0, paragraphIndex: 1, charOffset: 0 }, rows.length, cols, rows, new Map(), { width, border: 'Solid' });
    let t = null;
    for (let pg = 0; pg < out.pageCount() && !t; pg++) t = (parse(out.getPageControlLayout(pg)).controls || []).find(c => c.type === 'table' && !c.cellPath?.length) || null;
    if (t) {
      const ci = t.controlIdx ?? t.ci, sum = BLUEPRINT_RATIO.reduce((a, b) => a + b, 0), changes = [];
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) {
        const cell = r * cols + c, now = parse(out.getCellProperties(0, t.paraIdx, ci, cell)).width;
        changes.push({ cellIdx: cell, widthDelta: Math.round(width * BLUEPRINT_RATIO[c] / sum) - now });
      }
      if (out.resizeTableCells) parse(out.resizeTableCells(0, t.paraIdx, ci, JSON.stringify(changes)));
      for (const r of [0, rows.length - 1]) for (let c = 0; c < cols; c++) {
        out.setCellProperties(0, t.paraIdx, ci, r * cols + c, JSON.stringify({ fillType: 'solid', fillColor: '#eef2f7' }));
        const len = out.getCellParagraphLength(0, t.paraIdx, ci, r * cols + c, 0);
        if (len) out.applyCharFormatInCell(0, t.paraIdx, ci, r * cols + c, 0, 0, len, JSON.stringify({ bold: true }));
      }
    }
    return { bytes: out.exportHwpx(), count: blocks.length, total: Math.round(total * 10) / 10 };
  } finally { out.free(); }
}

// 정답·해설지: 문항마다 「번호. 정답」과 문항 안 [해설]·[풀이]·해설: 줄을 모은 새 한글 문서(글만). 지금 문서는 그대로.
const EXPLAIN_LINE = /^\s*(?:[\[【]\s*(?:해설|풀이)\s*[\]】]|(?:해설|풀이)\s*[:：])\s*/;
export function explanationCopy(bridge, title = '시험') {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), blocks = blocksWithLines(doc), answers = questionAnswers(doc), items = [];
  for (const q of blocks) {
    const notes = [];
    for (const { text: t } of q.lines) { const m = EXPLAIN_LINE.exec(t); if (m) notes.push(t.slice(m[0].length).trim()); }
    items.push({ head: q.essay ? q.label : `${q.number}. ${answers.get(q.number) || '(정답 없음)'}`, notes });
  }
  if (!items.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
  if (!items.some(i => i.notes.length) && !answers.size) throw new Error('문항 안에 「[정답] ③」이나 「[해설] …」 줄이 없습니다. 문항 → 정답으로 먼저 적으세요.');
  const Document = doc.constructor, out = Document.createEmpty();
  try {
    out.createBlankDocument();
    const lines = [{ text: `${String(title || '시험').trim()} 정답과 해설`, style: { bold: true, fontSize: 1500 }, center: true }];
    for (const it of items) {
      lines.push({ text: it.head, style: { bold: true } });
      for (const n of it.notes) lines.push({ text: n, style: null });
    }
    lines.forEach((line, i) => {
      if (i) parse(out.splitParagraph(0, i - 1, out.getParagraphLength(0, i - 1)));
      out.insertText(0, i, 0, line.text);
      const len = [...line.text].length;
      out.applyCharFormat(0, i, 0, len, JSON.stringify(line.style || { bold: false, fontSize: 1000 }));
      if (line.center) out.applyParaFormat(0, i, JSON.stringify({ alignment: 'center' }));
    });
    return { bytes: out.exportHwpx(), count: items.length, explained: items.filter(i => i.notes.length).length };
  } finally { out.free(); }
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

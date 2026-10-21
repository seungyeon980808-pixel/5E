// 학습지·시험지 만들기 도구(10-21 밤). 빈칸 학습지(표시 → 학생용 사본·정답 모음), 시험지 머리 양식, 정답표 칸, 문항 간격 일괄.
// 문서를 고치는 것은 모두 한 번의 되돌리기 단계(bridge.transaction). 학생용 사본은 지금 문서를 건드리지 않고 복사본에서 만든다.
import { insertTable } from './hwp-palette/native.js';
import { qrPng } from './qr-encode.js';
import { columnWidth, questionBlocks, swapAdjacentQuestions, renumberDocument } from './rhwp-exam-layout-tools.js';

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
// 교사만 보는 줄: 「[정답] …」「정답: …」「[해설]」「[풀이]」「[채점 기준]」「[교사용]」, 이 도구가 붙인 「[빈칸 정답]」「[나형 대응]」.
export const TEACHER_ONLY = /^\s*(?:[\[【〈<(]\s*(?:정답|해설|풀이|채점\s*기준|교사용|빈칸 정답|나형 대응)\s*[\]】〉>)]|(?:정답|해설|풀이)\s*[:：])/;
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
    return { bytes: copy.exportHwpx(), count: blanks.length, removed: teacher.length, answers: blanks.map(b => b.text) };
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
// 문항마다 적어 둔 정답: 문항 안의 「[정답] ③」「정답: ③」 줄. Map(번호 → 정답 글).
const ANSWER_LINE = /^\s*(?:[\[【]\s*정답\s*[\]】]|정답\s*[:：])\s*(\S.*)$/;
export function questionAnswers(doc) {
  const out = new Map();
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const q of questionBlocks(doc, sec))
    for (let p = q.head; p < q.end; p++) {
      const m = ANSWER_LINE.exec(String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p))));
      if (m) { out.set(q.number, m[1].trim()); break; }
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
const SCORE_MARK = /\s?\[\d+(?:\.\d+)?\s*점\]/g;
export function setQuestionScore(bridge, score) {
  const input = requireInput(bridge), doc = bridge.wasm.borrowDocumentHandle();
  const at = input.cursor.getPosition(), sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
  const q = questionBlocks(doc, sec).find(b => b.start <= para && para < b.end);
  if (!q) throw new Error('배점을 넣을 문항 안(「1.」로 시작하는 문항)에 커서를 두세요.');
  const textOf = p => String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
  bridge.transaction('question-score', () => {
    for (let p = q.head; p < q.end; p++) for (const m of [...textOf(p).matchAll(SCORE_MARK)].reverse()) doc.deleteText(sec, p, m.index, m[0].length);
    if (score != null) {
      let target = q.head;
      for (let p = q.head; p < q.end; p++) if (/\?\s*$/.test(textOf(p))) target = p;
      const text = textOf(target), trimmed = text.replace(/\s+$/, '');
      if (trimmed.length < text.length) doc.deleteText(sec, target, trimmed.length, text.length - trimmed.length);
      doc.insertText(sec, target, trimmed.length, ` [${score}점]`);
    }
    return true;
  });
  let total = 0, count = 0;
  for (let s = 0; s < doc.getSectionCount(); s++) for (let p = 0; p < doc.getParagraphCount(s); p++)
    for (const m of String(doc.getTextRange(s, p, 0, doc.getParagraphLength(s, p))).matchAll(/\[(\d+(?:\.\d+)?)\s*점\]/g)) { total += Number(m[1]); count++; }
  return { number: q.number, total: Math.round(total * 10) / 10, count };
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
  insertTable(doc, { sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 }, rows, cols, grid, options.assets || new Map(), options);
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
// 나형 만들기: 문항 순서를 섞은 사본(번호 다시 매김)과 「나형 번호 → 가형 번호」 대응. 지금 문서는 그대로.
export function makeVariant(bridge, random = Math.random, { choices = false } = {}) {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle();
  // 문항이 가장 많은 구역(보통 2단 본문)만 섞는다 — 머리 구역의 안내문은 그대로.
  let mainSec = 0; for (let s = 1; s < doc.getSectionCount(); s++) if (questionBlocks(doc, s).length > questionBlocks(doc, mainSec).length) mainSec = s;
  const first = questionBlocks(doc, mainSec);
  // 묶음 문항([1~2])은 제자리에 두고, 그 사이사이 이어진 낱개 문항끼리만 섞는다.
  const segments = []; let run = [];
  first.forEach((b, i) => { if (b.group) { if (run.length) segments.push(run); run = []; } else run.push(i); });
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
// 선지 섞기(나형 사본에만): 「①…」「②…」처럼 선지가 한 문단에 하나씩 이어진 문항만 문단째 섞고(서식 그대로), 번호 기호를 ①부터 다시 붙인다.
// 문항 안 「[정답] ③」도 바뀐 자리로 고친다. 한 줄에 선지 여럿(3열·5열·ㄱㄴㄷ 조합)인 문항은 그대로 둔다. 섞은 문항 수.
const MARKS = '①②③④⑤';
function shuffleChoices(doc, sec, random) {
  const textOf = p => String(doc.getTextRange(sec, p, 0, doc.getParagraphLength(sec, p)));
  const markAt = p => { const t = textOf(p), i = t.search(/\S/); return i < 0 ? null : { i, mark: t[i], rest: t.slice(i + 1) }; };
  let count = 0;
  for (let k = 0; k < questionBlocks(doc, sec).length; k++) {
    const b = questionBlocks(doc, sec)[k];
    let from = -1;
    for (let p = b.head + 1; p < b.end; p++) if (markAt(p)?.mark === MARKS[0]) { from = p; break; }
    if (from < 0) continue;
    let n = 0;
    while (n < MARKS.length && from + n < b.end) { const m = markAt(from + n); if (m?.mark !== MARKS[n] || /[①-⑤]/.test(m.rest)) break; n++; }
    if (n < 3 || (from + n < b.end && /^[①-⑤]/.test(markAt(from + n)?.mark || ''))) continue;
    const perm = [...Array(n).keys()];
    for (let tries = 0; tries < 20 && perm.every((v, i) => v === i); tries++) for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    if (perm.every((v, i) => v === i)) continue;
    const current = [...Array(n).keys()];
    for (let target = 0; target < n; target++) {
      let at = current.indexOf(perm[target]);
      while (at > target) { swapAdjacentQuestions(doc, sec, [{ start: from + at - 1, end: from + at }, { start: from + at, end: from + at + 1 }], 0); [current[at - 1], current[at]] = [current[at], current[at - 1]]; at--; }
    }
    for (let i = 0; i < n; i++) { const m = markAt(from + i); if (m.mark !== MARKS[i]) { doc.deleteText(sec, from + i, m.i, 1); doc.insertText(sec, from + i, m.i, MARKS[i]); } }
    const after = questionBlocks(doc, sec)[k];
    for (let p = after.head; p < after.end; p++) {
      const t = textOf(p), m = ANSWER_LINE.exec(t); if (!m) continue;
      const at = t.length - m[1].length + m[1].search(/[①-⑤]/), old = MARKS.indexOf(t[at]);
      if (m[1].search(/[①-⑤]/) >= 0 && old >= 0 && old < n) { doc.deleteText(sec, p, at, 1); doc.insertText(sec, p, at, MARKS[perm.indexOf(old)]); }
      break;
    }
    count++;
  }
  return count;
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
export function insertWorksheetFrame(bridge, title = '학습지') {
  requireInput(bridge);
  const doc = bridge.wasm.borrowDocumentHandle(), sec = doc.getSectionCount() - 1, width = columnWidth(doc, sec);
  const sections = [['학습 목표', '#eef2f7', 14], ['활동 1', '#eef6ee', 45], ['활동 2', '#eef6ee', 45], ['정리', '#fbf3e4', 30]];
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

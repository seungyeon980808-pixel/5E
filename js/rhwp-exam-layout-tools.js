// 5E_hwp 집중 도구 줄의 새 조판 기능(10-21). 모두 한 번의 되돌리기 단계(bridge.transaction)로 문서를 고친다.
// 그림 칸 너비 맞춤 · 그림 2×N 표 · 표를 단 폭에 맞춤 · 문항 번호 다시 매기기 · 선지 배열 바꾸기 · 조판 점검.
import { insertTable, mm, read } from './hwp-palette/native.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
// 문단 끝 위치(10-27 D4): 글 길이(getParagraphLength)에는 표·그림·수식 개체가 빠져 있다. 개체만 든 문단(5E_exam 선지 표)은 길이 0이라
// 「빈 줄」로 여겨 그 앞에 [정답]·정답표·대응표를 써 넣었고(표 앞에 들어감), 글 끝에서 나누면 끝의 개체가 다음 문단으로 떨어졌다.
// 개체 수까지 더한 끝에서 나누고, 엔진이 받지 않으면 예전 위치로.
const controlCount = (doc, sec, p) => { try { const x = doc.getControlTextPositions(sec, p); return (typeof x === 'string' ? JSON.parse(x || '[]') : x || []).length; } catch { return 0; } };
const paraEnd = (doc, sec, p) => doc.getParagraphLength(sec, p) + controlCount(doc, sec, p);
const splitAtEnd = (doc, sec, p) => { try { return doc.splitParagraph(sec, p, paraEnd(doc, sec, p)); } catch { return doc.splitParagraph(sec, p, doc.getParagraphLength(sec, p)); } };
const HWP_PER_MM = 7200 / 25.4;
const CIRCLED = '①②③④⑤';
const CAPTIONS = ['(가)', '(나)', '(다)', '(라)', '(마)', '(바)', '(사)', '(아)'];

function requireDocument(bridge) {
  const input = bridge?.input;
  if (!input?.cursor) throw new Error('먼저 시험지를 여세요.');
  return { input, wasm: bridge.wasm, doc: bridge.wasm.borrowDocumentHandle() };
}

// 지금 구역의 한 단 폭(HWPUNIT). 표·그림이 넘는지 볼 때와 표를 맞출 때 쓴다.
export function columnWidth(doc, section = 0) {
  const page = parse(doc.getPageDef(section)), columns = parse(doc.getColumnDef(section)) || {};
  const count = Math.max(1, columns.columnCount || 1), gap = columns.spacing || 0;
  return Math.floor((page.width - page.marginLeft - page.marginRight - (page.marginGutter || 0) - (count - 1) * gap) / count);
}

// 표 칸 안 그림을 칸 안쪽 너비에 맞춘다(양옆 합쳐 3mm 남김). 그림 비율은 그대로.
export function fitCellPicture(bridge) {
  const { input } = requireDocument(bridge);
  const ref = input.cursor.getSelectedPictureRef?.();
  if (!ref) throw new Error('표 칸 안의 그림을 먼저 누르세요.');
  if (!ref.cellPath?.length) throw new Error('표 칸 안에 있는 그림만 칸 너비에 맞출 수 있습니다.');
  const wasm = bridge.wasm, last = ref.cellPath.at(-1), cellIndex = last.cellIndex ?? last.cellIdx;
  const cell = parse(ref.cellPath.length > 1
    ? wasm.getCellPropertiesByPath(ref.sec, ref.ppi, JSON.stringify(ref.cellPath), cellIndex)
    : wasm.getCellProperties(ref.sec, ref.ppi, last.controlIndex ?? last.controlIdx, cellIndex));
  const props = bridge.properties(ref);
  const inner = cell.width - (cell.paddingLeft || 0) - (cell.paddingRight || 0) - (props.outerMarginLeft || 0) - (props.outerMarginRight || 0);
  const width = Math.max(1, Math.round(inner - 3 * HWP_PER_MM));
  if (!(props.width > 0) || Math.abs(width - props.width) < 20) return false;
  const height = Math.max(1, Math.round(props.height * width / props.width));
  bridge.transaction('fit-cell-picture', () => bridge.setProperties(ref, { width, height }));
  return true;
}

// 표 칸 안에서 그림만 있는 문단을 가운데로(기출 복원 규칙: 그림은 가운데).
export function centerPicturesInCells(bridge) {
  const { doc } = requireDocument(bridge);
  const key = (s, p, path) => `${s}:${p}:${JSON.stringify((path || []).map(c => [c.controlIndex ?? c.controlIdx, c.cellIndex ?? c.cellIdx, c.cellParaIndex ?? c.cellParaIdx]))}`;
  const texted = new Set(), targets = new Map();
  for (let page = 0; page < doc.pageCount(); page++) {
    for (const r of parse(doc.getPageTextLayout(page)).runs || []) if (r.cellPath?.length && String(r.text || '').trim()) texted.add(key(r.secIdx, r.paraIdx, r.cellPath));
    for (const c of parse(doc.getPageControlLayout(page)).controls || []) if (c.type === 'image' && c.cellPath?.length === 1) targets.set(key(c.secIdx, c.paraIdx, c.cellPath), c);
  }
  const todo = [...targets].filter(([k]) => !texted.has(k)).map(([, c]) => c);
  if (!todo.length) return 0;
  bridge.transaction('center-cell-pictures', () => {
    for (const c of todo) {
      const cell = c.cellPath[0];
      doc.applyParaFormatInCell(c.secIdx, c.paraIdx, cell.controlIndex ?? cell.controlIdx, cell.cellIndex ?? cell.cellIdx, cell.cellParaIndex ?? cell.cellParaIdx, JSON.stringify({ alignment: 'center' }));
    }
    return true;
  });
  return todo.length;
}

// 커서가 있는 문단의 그림 여러 개를 2×N 표로(윗줄 그림, 아랫줄 캡션 (가)(나)…). 5E 그림 연결(설명)은 그대로 옮긴다.
export function picturesToGrid(bridge) {
  const { input, doc } = requireDocument(bridge);
  const pos = input.getCursorPosition();
  if (pos.cellPath?.length || input.cursor.isInCell?.()) throw new Error('표 밖 본문에서 그림이 있는 문단을 누르세요.');
  const pictures = bridge.documentPictures().map(p => p.ref)
    .filter(ref => !ref.cellPath?.length && !ref.headerFooter && ref.sec === pos.sectionIndex && ref.ppi === pos.paragraphIndex)
    .sort((a, b) => a.ci - b.ci);
  if (pictures.length < 2) throw new Error('그림이 두 개 이상 있는 문단을 누르세요.');
  if (pictures.length > CAPTIONS.length) throw new Error(`그림은 ${CAPTIONS.length}개까지 한 표로 묶을 수 있습니다.`);
  const assets = new Map(), descriptions = [];
  pictures.forEach((ref, i) => {
    const props = bridge.properties(ref), bytes = new Uint8Array(bridge.pictureBytes(ref));
    const mime = bridge.pictureMime?.(ref) || 'image/png', ext = /jpe?g/.test(mime) ? 'jpg' : 'png';
    const pixel = bridge.pictureRasterSize?.(ref) || { width: Math.round(props.width / 75), height: Math.round(props.height / 75) };
    assets.set(`그림${i + 1}`, { bytes, widthMm: props.width / HWP_PER_MM, heightMm: props.height / HWP_PER_MM, width: pixel.width, height: pixel.height, extension: ext, name: `그림${i + 1}.${ext}` });
    descriptions.push(props.description || props.shapeComment || '');
  });
  const width = columnWidth(doc, pos.sectionIndex), n = pictures.length;
  bridge.transaction('pictures-to-grid', () => {
    for (const ref of [...pictures].reverse()) parse(doc.deletePictureControl(ref.sec, ref.ppi, ref.ci));
    const at = { sectionIndex: pos.sectionIndex, paragraphIndex: pos.paragraphIndex, charOffset: 0 };
    insertTable(doc, at, 2, n, [pictures.map((_, i) => [{ image: `그림${i + 1}` }]), CAPTIONS.slice(0, n)], assets, { width, border: 'None' });
    return true;
  });
  // 새 표 안 그림에 원래 5E 연결 설명을 다시 단다(그래야 「원본 편집」이 그대로 이어진다).
  const placed = bridge.documentPictures().map(p => p.ref)
    .filter(ref => ref.cellPath?.length === 1 && ref.sec === pos.sectionIndex && ref.ppi === pos.paragraphIndex)
    .sort((a, b) => (a.cellPath[0].cellIndex ?? a.cellPath[0].cellIdx) - (b.cellPath[0].cellIndex ?? b.cellPath[0].cellIdx));
  placed.forEach((ref, i) => { if (descriptions[i]) try { bridge.setProperties(ref, { description: descriptions[i] }); } catch {} });
  centerPicturesInCells(bridge);
  return n;
}

// 커서가 있는 표를 단 폭에 맞춘다(칸 비율 그대로).
export function fitTableToColumn(bridge) {
  const { input, wasm, doc } = requireDocument(bridge);
  if (!input.cursor.isInCell?.()) throw new Error('폭을 맞출 표의 칸을 먼저 누르세요.');
  const pos = input.getCursorPosition();
  if ((pos.cellPath?.length || 1) > 1) throw new Error('표 안의 표는 아직 폭을 맞출 수 없습니다.');
  const table = parse(wasm.getTableProperties(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex));
  const target = columnWidth(doc, pos.sectionIndex) - (table.outerLeft || 0) - (table.outerRight || 0);
  if (!(table.tableWidth > 0) || Math.abs(target - table.tableWidth) < 30) return false;
  const scale = target / table.tableWidth, count = parse(wasm.getTableDimensions(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex)).cellCount;
  const changes = [];
  for (let cellIdx = 0; cellIdx < count; cellIdx++) {
    const cell = parse(wasm.getCellProperties(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, cellIdx));
    if (cell.cellProtect) throw new Error('보호된 셀이 있는 표는 폭을 바꿀 수 없습니다.');
    changes.push({ cellIdx, widthDelta: Math.round(cell.width * scale) - cell.width });
  }
  bridge.transaction('fit-table-column', () => {
    const result = parse(wasm.resizeTableCells(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, changes));
    if (result?.ok === false) throw new Error(result.error || '표 폭을 맞추지 못했습니다.');
    return true;
  });
  return true;
}

const paragraphText = (doc, sec, para) => {
  const len = doc.getParagraphLength(sec, para);
  return len ? String(doc.getTextRange(sec, para, 0, len) ?? '') : '';
};

// 본문 표(한 겹) 자리: Map(「구역:문단」 → [표 번호…]). 문항이 표 하나로 된 학교 시험 틀(첫 칸 「1.」)을 찾을 때 쓴다.
export function topTables(doc) {
  const map = new Map();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if (c.type !== 'table' || c.cellPath?.length) continue;
    const key = `${c.secIdx ?? 0}:${c.paraIdx}`, ci = c.controlIdx ?? c.ci, list = map.get(key) || [];
    if (!list.includes(ci)) { list.push(ci); list.sort((a, b) => a - b); }
    map.set(key, list);
  }
  return map;
}
const cellText = (doc, sec, para, ci, cell, cp) => { const len = doc.getCellParagraphLength(sec, para, ci, cell, cp); return len ? String(doc.getTextInCell(sec, para, ci, cell, cp, 0, len) ?? '') : ''; };
// 표 문항 머리: 문단에 글이 없고 첫 표의 첫 칸이 「1.」이나 「[서술형 1]」뿐이면 그 표가 문항 하나다(팔레트 학교 시험 틀).
function tableHead(doc, sec, para, tables) {
  const ci = tables?.get(`${sec}:${para}`)?.[0]; if (ci === undefined || paragraphText(doc, sec, para).trim()) return null;
  let t; try { t = cellText(doc, sec, para, ci, 0, 0); } catch { return null; }
  const e = /^(\s*\[?\s*서술형\s*)(\d{1,2})\s*[\].)]?\s*$/.exec(t);
  if (e) return { essay: true, number: Number(e[2]), offset: e[1].length, digits: e[2], cell: { ci, cell: 0, cp: 0 } };
  const m = /^(\s*)(\d{1,3})\.\s*$/.exec(t);
  return m ? { essay: false, number: Number(m[2]), offset: m[1].length, digits: m[2], cell: { ci, cell: 0, cp: 0 } } : null;
}
// 문항 안의 줄: 본문 문단과 그 문단에 든 표(한 겹) 칸의 문단. [{text, where:{kind:'body',sec,p}|{kind:'cell',sec,p,ci,cell,cp}}]
export function blockLines(doc, sec, q, tables = topTables(doc)) {
  const out = [];
  for (let p = q.head; p < q.end; p++) {
    out.push({ text: paragraphText(doc, sec, p), where: { kind: 'body', sec, p } });
    for (const ci of tables.get(`${sec}:${p}`) || []) {
      let cells = 0; try { cells = parse(doc.getTableDimensions(sec, p, ci)).cellCount; } catch {}
      for (let cell = 0; cell < cells; cell++) for (let cp = 0; cp < doc.getCellParagraphCount(sec, p, ci, cell); cp++)
        out.push({ text: cellText(doc, sec, p, ci, cell, cp), where: { kind: 'cell', sec, p, ci, cell, cp } });
    }
  }
  return out;
}
// 수식·그림 개체가 든 자리인지: 본문 문단들(paras) 또는 그 문단의 표(ci) 안. 개체는 글 위치에 잡히지 않아 글만 옮기면 떨어져 남는다.
export function hasInlineObjects(doc, sec, paras, ci = null) {
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if ((c.secIdx ?? 0) !== sec || !['equation', 'image', 'shape'].includes(c.type) || !paras.includes(c.paraIdx)) continue;
    const inCell = Number.isInteger(c.cellIdx) || c.cellPath?.length;
    if (ci === null ? !inCell : inCell && (c.cellPath?.[0]?.controlIndex ?? ci) === ci) return true;
  }
  return false;
}
// 줄 하나 고치기(본문·표 칸 공통)
export function editLine(doc, where, start, removeLength, insert = '') {
  if (where.kind === 'body') { if (removeLength) doc.deleteText(where.sec, where.p, start, removeLength); if (insert) doc.insertText(where.sec, where.p, start, insert); }
  else { if (removeLength) doc.deleteTextInCell(where.sec, where.p, where.ci, where.cell, where.cp, start, removeLength); if (insert) doc.insertTextInCell(where.sec, where.p, where.ci, where.cell, where.cp, start, insert); }
}
export function formatLine(doc, where, start, end, props) {
  if (where.kind === 'body') doc.applyCharFormat(where.sec, where.p, start, end, JSON.stringify(props));
  else doc.applyCharFormatInCell(where.sec, where.p, where.ci, where.cell, where.cp, start, end, JSON.stringify(props));
}
export function lineCharProps(doc, where, offset) {
  return parse(where.kind === 'body' ? doc.getCharPropertiesAt(where.sec, where.p, offset) : doc.getCellCharPropertiesAt(where.sec, where.p, where.ci, where.cell, where.cp, offset));
}

// 본문 문단 머리의 「3.」 같은 문항 번호를 1부터 차례로 다시 매긴다(표·머리말 안은 건드리지 않음).
// 번호 다시 매기기 계획: 문단 머리 「n.」 번호와, 묶음 문항 머리 「[a~b]」의 범위(뒤따르는 첫 문항 번호부터 같은 개수).
export const GROUP_HEAD = /^(\s*)\[(\d{1,3})\s*([~～∼\-–])\s*(\d{1,3})\]/;
// 서술형 문항 머리: 「[서술형 1]」「서술형 2.」「서술형 3)」 — 선택형과 따로 번호를 매긴다.
export const ESSAY_HEAD = /^(\s*\[?\s*서술형\s*)(\d{1,2})(?=\s*[\].)]|\s)/;
function numberingPlan(doc) {
  const found = [], groups = [], tables = topTables(doc);
  let pending = null, n = 0, essay = 0;
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let para = 0; para < doc.getParagraphCount(sec); para++) {
      const text = paragraphText(doc, sec, para), g = GROUP_HEAD.exec(text);
      if (g) { pending = { sec, para, offset: g[1].length, length: g[0].length - g[1].length, sep: g[3], count: Math.max(1, Number(g[4]) - Number(g[2]) + 1), old: g[0].slice(g[1].length) }; continue; }
      const e = ESSAY_HEAD.exec(text);
      if (e) { const next = String(++essay); found.push({ sec, para, offset: e[1].length, digits: e[2], next, essay: true }); continue; }
      const m = /^(\s*)(\d{1,3})\.(?=\s|\S)/.exec(text);
      if (!m) {
        const th = tableHead(doc, sec, para, tables); if (!th) continue;
        found.push({ sec, para, offset: th.offset, digits: th.digits, next: String(th.essay ? ++essay : ++n), essay: th.essay, cell: th.cell });
        if (th.essay) continue;
      } else found.push({ sec, para, offset: m[1].length, digits: m[2], next: String(++n) });
      if (pending) { const want = `[${n}${pending.sep}${n + pending.count - 1}]`; if (want !== pending.old) groups.push({ ...pending, want }); pending = null; }
    }
  return { found, changes: found.filter(f => f.next !== f.digits), groups };
}
function applyNumbering(doc, plan) {
  for (const f of plan.changes) {
    if (f.cell) { doc.deleteTextInCell(f.sec, f.para, f.cell.ci, f.cell.cell, f.cell.cp, f.offset, f.digits.length); doc.insertTextInCell(f.sec, f.para, f.cell.ci, f.cell.cell, f.cell.cp, f.offset, f.next); }
    else { doc.deleteText(f.sec, f.para, f.offset, f.digits.length); doc.insertText(f.sec, f.para, f.offset, f.next); }
  }
  for (const g of plan.groups) { doc.deleteText(g.sec, g.para, g.offset, g.length); doc.insertText(g.sec, g.para, g.offset, g.want); }
}
export function renumberQuestions(bridge) {
  const { doc } = requireDocument(bridge);
  const plan = numberingPlan(doc);
  if (!plan.found.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
  const changes = plan.changes;
  if (!changes.length && !plan.groups.length) return 0;
  bridge.transaction('renumber-questions', () => {
    applyNumbering(doc, plan);
    return true;
  });
  return changes.length + plan.groups.length;
}

// 커서 근처의 선지(①~⑤)를 1열(줄마다)·3열(①②③ / ④⑤)·5열(한 줄)로 다시 놓는다. 팔레트의 선지 조판과 같은 방식(테두리 없는 표).
export function relayoutChoices(bridge, columns) {
  if (![1, 3, 5, 'auto'].includes(columns)) throw new Error('선지는 1열·3열·5열로 놓을 수 있습니다.');
  const { input, wasm, doc } = requireDocument(bridge);
  const pos = input.getCursorPosition();
  if (pos.cellPath?.length > 1) throw new Error('표 안 표의 선지는 바꿀 수 없습니다.');
  let block;
  if (input.cursor.isInCell?.()) {
    // 테두리 없는 선지 표 안에 커서가 있는 경우
    const dims = parse(wasm.getTableDimensions(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex)), texts = [];
    for (let cell = 0; cell < dims.cellCount; cell++) {
      const paras = wasm.getCellParagraphCount(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, cell);
      let text = '';
      for (let p = 0; p < paras; p++) text += (p ? ' ' : '') + String(wasm.getTextInCell(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, cell, p, 0, wasm.getCellParagraphLength(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, cell, p)) ?? '');
      if (text.trim()) texts.push(text.trim());
    }
    block = { kind: 'table', sec: pos.sectionIndex, para: pos.parentParaIndex, ci: pos.controlIndex, texts };
  } else {
    // 본문 문단: 커서 문단부터 위아래로 ①~⑤가 든 문단을 모은다.
    // 「[정답] ②」「해설: ③」 같은 교사용 줄은 선지가 아니다(선지 바로 아래에 붙는 일이 많다).
    const teacherLine = /^\s*(?:[\[【〈<(]\s*(?:정답|해설|풀이)|(?:정답|해설|풀이)\s*[:：])/;
    const sec = pos.sectionIndex, has = p => p >= 0 && p < doc.getParagraphCount(sec) && /[①②③④⑤]/.test(paragraphText(doc, sec, p)) && !teacherLine.test(paragraphText(doc, sec, p));
    if (!has(pos.paragraphIndex)) throw new Error('선지(①~⑤)가 있는 줄이나 선지 표를 누르세요.');
    let first = pos.paragraphIndex, last = pos.paragraphIndex;
    while (has(first - 1)) first--;
    while (has(last + 1)) last++;
    const texts = [];
    for (let p = first; p <= last; p++) texts.push(paragraphText(doc, sec, p));
    // 첫 문단의 ① 앞 글(발문 등)은 남긴다.
    const keep = texts[0].search(/[①②③④⑤]/);
    texts[0] = texts[0].slice(keep);
    block = { kind: 'paragraphs', sec, first, last, texts, keep };
  }
  const joined = block.texts.join(' ');
  const options = joined.split(/(?=[①②③④⑤])/).map(s => s.trim()).filter(s => /^[①②③④⑤]/.test(s)).map(s => s.replace(/^[①②③④⑤]\s*/, '').replace(/\t+/g, ' ').trim());
  if (options.length !== 5) throw new Error(`선지 다섯 개를 찾지 못했습니다(찾은 수 ${options.length}).`);
  if (/[^\S ]/.test(joined.replace(/\t/g, ' ')) && /￼/.test(joined)) throw new Error('수식·그림이 든 선지는 아직 배열을 바꿀 수 없습니다.');
  if (block.kind === 'table' ? hasInlineObjects(doc, block.sec, [block.para], block.ci) : hasInlineObjects(doc, block.sec, Array.from({ length: block.last - block.first + 1 }, (_, i) => block.first + i)))
    throw new Error('수식·그림이 든 선지는 아직 배열을 바꿀 수 없습니다(수식이 선지에서 떨어지지 않게 막음).');
  const labelled = options.map((s, i) => `${CIRCLED[i]} ${s}`);
  const width = columnWidth(doc, block.sec);
  if (columns === 'auto') columns = autoChoiceColumns(labelled, width);
  bridge.transaction('relayout-choices', () => {
    let at;
    if (block.kind === 'table') {
      parse(doc.deleteTableControl(block.sec, block.para, block.ci));
      at = { sectionIndex: block.sec, paragraphIndex: block.para, charOffset: 0 };
    } else {
      for (let p = block.last; p > block.first; p--) {
        doc.deleteText(block.sec, p, 0, doc.getParagraphLength(block.sec, p));
        doc.mergeParagraph(block.sec, p); // p번 문단을 앞 문단에 붙인다
      }
      const length = doc.getParagraphLength(block.sec, block.first);
      if (length > block.keep) doc.deleteText(block.sec, block.first, block.keep, length - block.keep);
      let para = block.first;
      if (block.keep > 0) {
        // 앞 글 끝의 빈칸·탭을 정리하고 선지는 다음 문단에서 시작한다.
        const head = paragraphText(doc, block.sec, block.first), trimmed = head.replace(/[ \t]+$/, '');
        if (trimmed.length < head.length) doc.deleteText(block.sec, block.first, trimmed.length, head.length - trimmed.length);
        doc.splitParagraph(block.sec, block.first, trimmed.length); para = block.first + 1;
      }
      at = { sectionIndex: block.sec, paragraphIndex: para, charOffset: 0 };
    }
    if (columns === 1) {
      let p = at.paragraphIndex;
      labelled.forEach((text, i) => {
        if (i) { doc.splitParagraph(block.sec, p, doc.getParagraphLength(block.sec, p)); p++; }
        doc.insertText(block.sec, p, 0, text);
      });
    } else {
      const rows = columns === 3 ? 2 : 1, grid = Array.from({ length: rows }, (_, r) => labelled.slice(r * columns, (r + 1) * columns));
      insertTable(doc, at, rows, columns, grid, new Map(), { width, border: 'None' });
    }
    return true;
  });
  return columns;
}
// 선지 길이로 열 수 고르기: 가장 긴 선지가 한 칸(단 폭 ÷ 열 수)에 한 줄로 들어가는 가장 많은 열(5 → 3 → 1).
// 글자 폭은 10pt 기준 한글·전각 3.6mm, 영문·숫자·기호 2mm, 칸 여백 4mm로 어림한다.
export function autoChoiceColumns(labelled, widthHwp) {
  const widthMm = widthHwp / 7200 * 25.4;
  const need = text => [...text].reduce((mm, c) => mm + (/[\u0000-\u00ff]/.test(c) ? 2 : 3.6), 0) + 4;
  const longest = Math.max(...labelled.map(need));
  for (const cols of [5, 3]) if (longest <= widthMm / cols) return cols;
  return 1;
}

// 인쇄 전 조판 점검. 고칠 자리를 [{text, at}]로 돌려준다(at이 있으면 누르면 그 자리로 간다).
export function checkLayout(bridge) {
  const { doc } = requireDocument(bridge);
  const issues = [], width = columnWidth(doc, 0);
  // 1) 단 폭을 넘는 그림·표, 낮은 해상도 그림
  for (const { ref } of bridge.documentPictures()) {
    if (ref.headerFooter) continue;
    let props; try { props = bridge.properties(ref); } catch { continue; }
    const at = { sectionIndex: ref.sec, paragraphIndex: ref.ppi, charOffset: 0 };
    if (!ref.cellPath?.length && props.width > width + 30) issues.push({ text: `그림이 단 폭보다 넓습니다(${Math.round(props.width / HWP_PER_MM)}mm > ${Math.round(width / HWP_PER_MM)}mm).`, at });
    const pixel = bridge.pictureRasterSize?.(ref);
    const dpi = pixel?.width ? pixel.width / (props.width / 7200) : 0;
    if (dpi && dpi < 150) issues.push({ text: `그림 해상도가 낮습니다(약 ${Math.round(dpi)}dpi · 인쇄하면 흐릴 수 있음).`, at });
  }
  for (let sec = 0; sec < doc.getSectionCount(); sec++) {
    const numbers = [];
    for (let para = 0; para < doc.getParagraphCount(sec); para++) {
      const text = paragraphText(doc, sec, para), at = { sectionIndex: sec, paragraphIndex: para, charOffset: 0 };
      // 2) 채우지 않은 빈칸(\이름\)
      const slot = /\\([0-9A-Za-z가-힣_]{1,20})?\\/.exec(text);
      if (slot) issues.push({ text: `채우지 않은 빈칸 「${slot[0]}」가 남아 있습니다.`, at });
      const m = /^\s*(\d{1,3})\./.exec(text);
      if (m) numbers.push({ n: Number(m[1]), at });
    }
    // 3) 문항 번호 빠짐·겹침
    numbers.forEach((item, i) => {
      if (i && item.n === numbers[i - 1].n) issues.push({ text: `문항 번호 ${item.n}번이 두 번 나옵니다.`, at: item.at });
      else if (i && item.n !== numbers[i - 1].n + 1) issues.push({ text: `문항 번호가 ${numbers[i - 1].n}번 다음에 ${item.n}번으로 건너뜁니다.`, at: item.at });
    });
  }
  // 4) 단 폭을 넘는 표
  for (let page = 0; page < doc.pageCount(); page++) {
    for (const c of parse(doc.getPageControlLayout(page)).controls || []) {
      if (c.type !== 'table' || c.cellPath?.length) continue;
      try {
        const t = parse(doc.getTableProperties(c.secIdx, c.paraIdx, c.controlIdx ?? c.ci));
        if (t.tableWidth > width + 30) issues.push({ text: `표가 단 폭보다 넓습니다(${Math.round(t.tableWidth / HWP_PER_MM)}mm > ${Math.round(width / HWP_PER_MM)}mm).`, at: { sectionIndex: c.secIdx, paragraphIndex: c.paraIdx, charOffset: 0 } });
      } catch {}
    }
  }
  const seen = new Set();
  return issues.filter(i => { const k = i.text + JSON.stringify(i.at || ''); if (seen.has(k)) return false; seen.add(k); return true; });
}

export { mm, read };

// ── 문항 묶음: 「1.」로 시작하는 본문 문단부터 다음 번호 문단 앞까지 ──
// 묶음 문항: 「[1~2] 다음 글을 읽고 …」 머리와 지문은 앞 문항이 아니라 묶음 첫 문항 쪽에 붙인다(start=머리, head=번호 문단).
// 묶음에 든 문항은 group={head, from, to}를 가진다 — 순서 바꾸기는 묶음을 깨므로 막는다.
export function questionBlocks(doc, sec = 0, tables = topTables(doc)) {
  const count = doc.getParagraphCount(sec), starts = [];
  let pending = null, group = null;
  for (let p = 0; p < count; p++) {
    const text = paragraphText(doc, sec, p), g = GROUP_HEAD.exec(text);
    if (g) { pending = { head: p, from: Number(g[2]), to: Number(g[4]) }; continue; }
    let head = null;
    const e = ESSAY_HEAD.exec(text), m = e ? null : /^\s*(\d{1,3})\./.exec(text);
    if (e) head = { essay: true, number: Number(e[2]) };
    else if (m) head = { essay: false, number: Number(m[1]) };
    else { const th = tableHead(doc, sec, p, tables); if (th) head = { essay: th.essay, number: th.number, cell: th.cell }; }
    if (!head) continue;
    const extra = head.cell ? { cell: head.cell } : {};
    if (head.essay) { group = null; pending = null; starts.push({ start: p, head: p, number: head.number, essay: true, ...extra }); continue; }
    const number = head.number;
    if (pending) { group = { ...pending, to: number + (pending.to - pending.from) }; starts.push({ start: pending.head, head: p, number, group, ...extra }); pending = null; continue; }
    if (group && number > group.to) group = null;
    starts.push({ start: p, head: p, number, ...(group ? { group } : {}), ...extra });
  }
  const preview = s => {
    if (s.cell) { try { for (let cell = 1; cell < 4; cell++) { const t = cellText(doc, sec, s.head, s.cell.ci, cell, 0).trim(); if (t) return t; } } catch {} return ''; }
    return paragraphText(doc, sec, s.head).replace(s.essay ? /^\s*\[?\s*서술형\s*\d{1,2}\s*[\].)]?\s*/ : /^\s*\d{1,3}\.\s*/, '');
  };
  return starts.map((s, i) => ({ ...s, label: s.essay ? `서술형 ${s.number}` : `${s.number}번`, end: i + 1 < starts.length ? starts[i + 1].start : count, preview: preview(s).slice(0, 40) }));
}

// 모든 구역의 문항(학교 시험지는 보통 1쪽 머리 구역 + 2단 본문 구역). index는 문서 전체 순서.
export function allQuestionBlocks(doc) {
  const out = [], tables = topTables(doc);
  for (let sec = 0; sec < doc.getSectionCount(); sec++) for (const b of questionBlocks(doc, sec, tables)) out.push({ ...b, sec });
  return out;
}
// 문서 전체 index → 그 구역 안 순서
const localIndex = (all, index) => all.slice(0, index).filter(b => b.sec === all[index].sec).length;

// 문항 순서 바꾸기: index번째 문항을 위(-1)·아래(+1) 문항과 바꾼 뒤 번호를 다시 매긴다. 서식·표·그림은 내부 복사로 그대로 옮긴다.
export function moveQuestion(bridge, index, direction) {
  const { doc } = requireDocument(bridge), all = allQuestionBlocks(doc), to = index + (direction < 0 ? -1 : 1);
  if (!all[to]) throw new Error(direction < 0 ? '맨 위 문항입니다.' : '맨 아래 문항입니다.');
  return moveQuestionTo(bridge, index, to);
}
// 문항을 from번째에서 to번째 자리로(문서 전체 순서). 이웃 바꾸기를 이어 하고 번호를 다시 매기는 것까지 한 번에(되돌리기 한 번).
// 같은 구역·같은 종류(선택형/서술형)·묶음 아닌 문항 사이에서만.
export function moveQuestionTo(bridge, from, to) {
  const { doc } = requireDocument(bridge), all = allQuestionBlocks(doc);
  if (!all[from] || !all[to]) throw new Error('문항을 찾지 못했습니다.');
  if (from === to) return to;
  const lo = Math.min(from, to), hi = Math.max(from, to), span = all.slice(lo, hi + 1);
  if (span.some(q => q.sec !== all[from].sec)) throw new Error('구역(쪽 설정)이 다른 문항끼리는 순서를 바꿀 수 없습니다.');
  if (span.some(q => !!q.essay !== !!all[from].essay)) throw new Error('선택형과 서술형 문항끼리는 순서를 바꿀 수 없습니다.');
  if (span.some(q => q.group)) throw new Error('묶음 문항([1~2] 같은)은 지문과 함께 있어야 해서 순서를 바꿀 수 없습니다.');
  const sec = all[from].sec, base = localIndex(all, lo), steps = [];
  if (to > from) for (let a = 0; a < to - from; a++) steps.push(base + a);
  else for (let a = from - to - 1; a >= 0; a--) steps.push(base + a);
  bridge.transaction('move-question-to', () => {
    for (const a of steps) swapAdjacentQuestions(doc, sec, questionBlocks(doc, sec), a);
    renumberDocument(doc);
    return true;
  });
  return to;
}
// 문항마다 개체(표·그림·수식) 수 — 가·나형으로 섞은 뒤에도 같아야 한다(10-27 D3).
// 한글 엔진(rhwp 0.8.7)의 문단 범위 복사·붙여넣기는 개체만 든 문단(5E_exam이 만든 선지 표·그림)이 섞이면 개체를 겹쳐 붙이거나 다른 문단으로 옮긴다.
// 그러면 표·그림이 글과 겹친 문서가 나온다 — 바뀐 것이 보이면 되돌리고(편집 묶음 오류 = 원래대로) 알린다.
export function objectCounts(doc, sec) {
  // 쪽 배치에 그려지는 개체(표·그림·수식·도형)만 센다 — 구역·단 설정 같은 보이지 않는 개체는 0번 문단에 남아 문항과 함께 움직이지 않는다.
  // 편집 묶음 안에서는 쪽 배치가 미뤄져 있어 마저 한 뒤 잰다.
  try { doc.flushDeferredPagination?.(); } catch {}
  const perPara = new Map(), seenObj = new Set();
  for (let pg = 0; pg < doc.pageCount(); pg++) for (const c of parse(doc.getPageControlLayout(pg)).controls || []) {
    if ((c.secIdx ?? 0) !== sec || c.cellPath?.length) continue;
    // 단·쪽을 넘는 표는 조각마다 한 번씩 나온다 — 개체 하나로 센다.
    const id = `${c.paraIdx}:${c.controlIdx ?? c.ci}`; if (seenObj.has(id)) continue; seenObj.add(id);
    perPara.set(c.paraIdx, (perPara.get(c.paraIdx) || 0) + 1);
  }
  return questionBlocks(doc, sec).map(q => { let n = 0; for (let p = q.head; p < q.end; p++) n += perPara.get(p) || 0; return { key: paragraphText(doc, sec, q.head).replace(/^\s*\d{1,3}\.\s*/, '').slice(0, 30), n }; });
}
export function assertObjectsKept(before, after, what) {
  const bag = list => list.map(x => `${x.key}|${x.n}`).sort().join('\n');
  if (bag(before) !== bag(after)) throw new Error(`${what} 문항의 그림·표 자리가 어긋나서 하지 않았습니다. 5E_exam에서 만든 시험지는 5E_exam 시험지 화면에서 순서를 바꾸거나 B형을 만드세요.`);
}
// a번째와 a+1번째 문항 묶음을 바꾼다(문서 손잡이만 씀 — 복사본에도 쓴다).
export function swapAdjacentQuestions(doc, sec, blocks, a) {
  {
    let { start: bs, end: be } = blocks[a + 1];
    const last = be === doc.getParagraphCount(sec);
    // 마지막 문항은 뒤에 문단 나눔이 없어 붙여 넣으면 앞 문항 첫 줄과 합쳐진다 — 빈 문단을 하나 덧대 옮긴 뒤 지운다.
    if (last) parse(doc.splitParagraph(sec, be - 1, doc.getParagraphLength(sec, be - 1))); // 덧댄 빈 문단(번호 be)의 맨 앞까지가 옮길 범위
    checkedResult(doc.copySelection(sec, bs, 0, be, 0));
    checkedResult(doc.deleteRange(sec, bs, 0, be, 0));
    checkedResult(doc.pasteInternal(sec, blocks[a].start, 0));
    if (last) {
      const n = doc.getParagraphCount(sec);
      if (n > 1 && !doc.getParagraphLength(sec, n - 1)) doc.mergeParagraph(sec, n - 1);
    }
    return true;
  }
}
// 문서 손잡이만으로 번호 다시 매기기(복사본용).
export function renumberDocument(doc) {
  const plan = numberingPlan(doc);
  applyNumbering(doc, plan);
  return plan.found.length;
}
function checkedResult(value) { const r = parse(value); if (r?.ok === false) throw new Error(r.error || '문항을 옮기지 못했습니다.'); return r; }

// 쪽·단 경계에서 나뉜 문항 찾기: 문항 묶음의 글이 두 쪽(또는 두 단)에 걸치면 알린다.
export function splitQuestions(doc, sec = null) {
  if (sec === null) { const out = []; for (let s = 0; s < doc.getSectionCount(); s++) out.push(...splitQuestions(doc, s)); return out; }
  const blocks = questionBlocks(doc, sec); if (!blocks.length) return [];
  // 편집 묶음 안에서는 쪽 배치가 미뤄진다 — 재기 전에 마저 한다(없으면 아무 일 없음).
  try { doc.flushDeferredPagination?.(); } catch {}
  const columns = Math.max(1, parse(doc.getColumnDef(sec))?.columnCount || 1), page = parse(doc.getPageDef(sec));
  const where = new Map();
  // 글자 위치(x, px)는 쪽 원점 기준이 아니다 — 쪽마다 가장 왼쪽 글자를 첫 단 시작으로 보고 단 폭(px = HWPUNIT/75)으로 나눈다.
  const columnPx = (page.width - page.marginLeft - page.marginRight) / columns / 75;
  for (let pg = 0; pg < doc.pageCount(); pg++) {
    const runs = (parse(doc.getPageTextLayout(pg)).runs || []).filter(r => r.secIdx === sec && !r.cellPath?.length && String(r.text || '').trim());
    const left = Math.min(...runs.map(r => r.x));
    for (const r of runs) {
    const col = columns > 1 ? Math.min(columns - 1, Math.max(0, Math.floor((r.x - left) / columnPx))) : 0;
    if (!where.has(r.paraIdx)) where.set(r.paraIdx, new Set());
    where.get(r.paraIdx).add(`${pg}:${Number.isFinite(col) ? col : 0}`);
    }
  }
  const issues = [];
  for (const b of blocks) {
    const spots = new Set();
    for (let p = b.start; p < b.end; p++) for (const s of where.get(p) || []) spots.add(s);
    if (spots.size > 1) issues.push({ text: `${b.label} 문항이 ${columns > 1 ? '쪽·단' : '쪽'} 경계에서 나뉩니다(${[...spots].map(s => { const [pg, c] = s.split(':'); return columns > 1 ? `${+pg + 1}쪽 ${+c + 1}단` : `${+pg + 1}쪽`; }).join(' → ')}).`, at: { sectionIndex: sec, paragraphIndex: b.start, charOffset: 0 } });
  }
  return issues;
}

// 문항 복제: index번째 문항을 바로 뒤에 한 벌 더 넣고 번호를 다시 매긴다.
export function duplicateQuestion(bridge, index) {
  const { doc } = requireDocument(bridge), q = allQuestionBlocks(doc)[index], sec = q?.sec;
  if (!q) throw new Error('문항을 찾지 못했습니다.');
  bridge.transaction('duplicate-question', () => {
    let end = q.end;
    const last = end === doc.getParagraphCount(sec);
    if (last) parse(doc.splitParagraph(sec, end - 1, doc.getParagraphLength(sec, end - 1)));
    // 묶음 첫 문항은 묶음 머리·지문 없이 문항만 복제한다.
    checkedResult(doc.copySelection(sec, q.head, 0, end, 0));
    checkedResult(doc.pasteInternal(sec, end, 0));
    if (last) { const n = doc.getParagraphCount(sec); if (n > 1 && !doc.getParagraphLength(sec, n - 1)) doc.mergeParagraph(sec, n - 1); }
    renumberDocument(doc); // 번호 다시 매기기까지 한 묶음(되돌리기 한 번)
    return true;
  });
  return index + 1;
}
// 문항 지우기: index번째 문항 묶음을 통째로 지우고 번호를 다시 매긴다.
export function deleteQuestion(bridge, index) {
  const { doc } = requireDocument(bridge), q = allQuestionBlocks(doc)[index], sec = q?.sec;
  if (!q) throw new Error('문항을 찾지 못했습니다.');
  bridge.transaction('delete-question', () => {
    // 묶음 첫 문항을 지울 때도 묶음 머리·지문은 남긴다(다른 문항이 쓴다).
    const from = q.group ? q.head : q.start;
    if (q.end < doc.getParagraphCount(sec)) checkedResult(doc.deleteRange(sec, from, 0, q.end, 0));
    else if (from > 0) checkedResult(doc.deleteRange(sec, from - 1, doc.getParagraphLength(sec, from - 1), q.end - 1, doc.getParagraphLength(sec, q.end - 1)));
    else checkedResult(doc.deleteRange(sec, 0, 0, q.end - 1, doc.getParagraphLength(sec, q.end - 1)));
    renumberDocument(doc); // 번호 다시 매기기까지 한 묶음(되돌리기 한 번)
    return true;
  });
  return q.number;
}
// 넓은 그림·표 모두 단 폭에 맞추기(본문 그림은 비율 유지, 표는 칸 비율 유지). 고친 수를 돌려준다.
export function fitWideObjects(bridge) {
  const { wasm, doc } = requireDocument(bridge), width = columnWidth(doc, 0);
  const pictures = [], tables = [];
  for (const { ref } of bridge.documentPictures()) {
    if (ref.headerFooter || ref.cellPath?.length) continue;
    try { const p = bridge.properties(ref); if (p.width > width + 30) pictures.push({ ref, p }); } catch {}
  }
  for (let page = 0; page < doc.pageCount(); page++) for (const c of parse(doc.getPageControlLayout(page)).controls || []) {
    if (c.type !== 'table' || c.cellPath?.length) continue;
    const ci = c.controlIdx ?? c.ci, key = `${c.secIdx}:${c.paraIdx}:${ci}`;
    if (tables.some(t => t.key === key)) continue;
    try { const t = parse(doc.getTableProperties(c.secIdx, c.paraIdx, ci)); if (t.tableWidth > width + 30) tables.push({ key, sec: c.secIdx, para: c.paraIdx, ci, t }); } catch {}
  }
  if (!pictures.length && !tables.length) return 0;
  bridge.transaction('fit-wide-objects', () => {
    for (const { ref, p } of pictures) { const w = width - (p.outerMarginLeft || 0) - (p.outerMarginRight || 0); bridge.setProperties(ref, { width: w, height: Math.round(p.height * w / p.width) }); }
    for (const { sec, para, ci, t } of tables) {
      const target = width - (t.outerLeft || 0) - (t.outerRight || 0), scale = target / t.tableWidth, count = parse(wasm.getTableDimensions(sec, para, ci)).cellCount, changes = [];
      for (let cellIdx = 0; cellIdx < count; cellIdx++) { const cell = parse(wasm.getCellProperties(sec, para, ci, cellIdx)); changes.push({ cellIdx, widthDelta: Math.round(cell.width * scale) - cell.width }); }
      checkedResult(wasm.resizeTableCells(sec, para, ci, changes));
    }
    return true;
  });
  return pictures.length + tables.length;
}

// 쪽·단 경계에서 나뉜 문항을 통째로 다음 단(1단이면 다음 쪽)으로 넘긴다. 단 하나보다 긴 문항은 넘겨도 나뉘므로 그대로 둔다.
// 앞에서부터 하나씩 넘기고 다시 잰다(앞 문항을 넘기면 뒤 문항 자리가 바뀐다). {moved, left}를 돌려준다.
export function keepQuestionsWhole(bridge) {
  const { doc } = requireDocument(bridge);
  let moved = 0, left = 0;
  bridge.transaction('keep-questions-whole', () => {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) { const r = keepSectionWhole(doc, sec); moved += r.moved; left += r.left; }
    return true;
  });
  return { moved, left };
}
// 문서 손잡이만 쓰는 「나뉜 문항 넘기기」(학생용 사본에도 쓴다). {moved, left}
export function keepQuestionsWholeDoc(doc) {
  let moved = 0, left = 0;
  for (let sec = 0; sec < doc.getSectionCount(); sec++) { const r = keepSectionWhole(doc, sec); moved += r.moved; left += r.left; }
  return { moved, left };
}
function keepSectionWhole(doc, sec) {
  const columns = Math.max(1, parse(doc.getColumnDef(sec))?.columnCount || 1);
  let moved = 0;
  const skipped = new Set();
  {
    for (let guard = 0; guard < 60; guard++) {
      // 맨 앞 문단(0번)은 구역·단 설정을 품고 있어 앞에 나누기를 넣거나 지우면 안 된다 — 문서 첫 문항은 넘기지 않는다.
      const next = splitQuestions(doc, sec).find(issue => issue.at.paragraphIndex > 0 && !skipped.has(issue.at.paragraphIndex));
      if (!next) break;
      const start = next.at.paragraphIndex, count = doc.getParagraphCount(sec);
      checkedResult(columns > 1 ? doc.insertColumnBreak(sec, start, 0) : doc.insertPageBreak(sec, start, 0));
      // 나누기를 넣으면 앞에 빈 문단이 하나 생긴다 — 지워서 앞 단 끝에 빈 줄이 남지 않게 한다.
      let first = start;
      if (doc.getParagraphCount(sec) > count && !doc.getParagraphLength(sec, start)) checkedResult(doc.deleteParagraph(sec, start));
      const still = splitQuestions(doc, sec).some(issue => issue.at.paragraphIndex === first);
      if (still) skipped.add(first); else moved++;
    }
  }
  const first = splitQuestions(doc, sec).some(issue => issue.at.paragraphIndex === 0);
  return { moved, left: skipped.size + (first ? 1 : 0) };
}

// 단 채우기: 단마다 마지막 문항 아래 남는 빈 공간을 그 단의 문항 사이에 고르게 나눠 준다(풀이 공간이 문항마다 비슷해진다).
// 다시 눌러도 같은 결과가 나오게, 먼저 문항 위 간격을 0으로 되돌린 뒤 잰다(「문항 간격」으로 맞춘 값은 이 고른 간격으로 바뀐다).
// 단을 넘긴 문항이 있는 단은 건드리지 않는다. 문단 위 간격 값은 1pt=200, 화면 1px=0.75pt=150.
export function fillColumns(bridge) {
  const { doc } = requireDocument(bridge);
  if (allQuestionBlocks(doc).length < 2) throw new Error('번호가 붙은 문항이 둘 이상 있어야 단을 채울 수 있습니다.');
  let result = { changed: 0, columns: 0 };
  bridge.transaction('fill-columns', () => { result = fillColumnsDoc(doc); return true; });
  return result;
}
// 문서 손잡이만 쓰는 단 채우기(학생용 사본에도 쓴다).
export function fillColumnsDoc(doc) {
  const all = allQuestionBlocks(doc);
  let changed = 0, columnsFilled = 0;
  {
    for (let sec = 0; sec < doc.getSectionCount(); sec++) {
      const blocks = all.filter(b => b.sec === sec); if (blocks.length < 2) continue;
      const base = 0;
      for (const b of blocks.slice(1)) doc.applyParaFormat(sec, b.start, JSON.stringify({ spacingBefore: base }));
      try { doc.flushDeferredPagination?.(); } catch {}
      const before = new Set(splitQuestions(doc, sec).map(i => i.at.paragraphIndex));
      // 단마다: 그 단에서 시작하는 문항, 그 단의 맨 아래 글·개체 위치.
      const spots = new Map(), firstSpot = new Map();
      for (let pg = 0; pg < doc.pageCount(); pg++) {
        const info = parse(doc.getPageInfo(pg)); if (info.sectionIndex !== sec && !(parse(doc.getPageTextLayout(pg)).runs || []).some(r => r.secIdx === sec)) continue;
        const cols = info.columns?.length ? info.columns : [{ x: info.bodyLeft, width: info.bodyRight - info.bodyLeft }];
        const colOf = x => { let i = cols.findIndex(c => x < c.x + c.width + 4); return i < 0 ? cols.length - 1 : i; };
        const bottom = info.footerArea?.y ?? (info.height - info.marginBottom - info.marginFooter);
        const add = (paraIdx, x, y, hgt) => {
          const key = `${pg}:${colOf(x)}`; if (!spots.has(key)) spots.set(key, { bottom, low: 0, paras: new Set() });
          const s = spots.get(key); s.low = Math.max(s.low, y + hgt); s.paras.add(paraIdx);
          if (!firstSpot.has(paraIdx)) firstSpot.set(paraIdx, key);
        };
        for (const r of parse(doc.getPageTextLayout(pg)).runs || []) if (r.secIdx === sec && !r.cellPath?.length) add(r.paraIdx, r.x, r.y, r.h);
        for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if ((c.secIdx ?? sec) === sec && !c.cellPath?.length && Number.isFinite(c.y) && Number.isFinite(c.h)) add(c.paraIdx, c.x, c.y, c.h);
      }
      const plans = [];
      for (const [key, s] of spots) {
        const starts = blocks.filter(b => firstSpot.get(b.start) === key);
        if (starts.length < 2) continue;
        // 단 끝 문항이 다음 단으로 이어지면(나뉜 문항) 이 단은 이미 꽉 찼다.
        if (starts.some(b => before.has(b.start))) continue;
        const leftover = s.bottom - s.low - 6; if (leftover < 8) continue;
        const extra = Math.floor(leftover / starts.length * 150 / 100) * 100; if (extra <= 0) continue;
        plans.push({ starts: starts.slice(1), extra });
      }
      for (const p of plans) for (const b of p.starts) { doc.applyParaFormat(sec, b.start, JSON.stringify({ spacingBefore: base + p.extra })); changed++; }
      try { doc.flushDeferredPagination?.(); } catch {}
      // 늘린 간격 때문에 새로 나뉜 문항이 생기면 이 구역은 기준 간격으로 되돌린다.
      if (splitQuestions(doc, sec).some(i => !before.has(i.at.paragraphIndex))) {
        for (const p of plans) for (const b of p.starts) { doc.applyParaFormat(sec, b.start, JSON.stringify({ spacingBefore: base })); changed--; }
      } else columnsFilled += plans.length;
    }
  }
  return { changed, columns: columnsFilled };
}
// 단 채우기를 쓴 문서인지 어림: 같은 구역 문항 위 간격이 두 가지 넘게 다르면(단마다 다른 간격) 채운 것으로 본다.
export function looksColumnFilled(doc) {
  for (let sec = 0; sec < doc.getSectionCount(); sec++) {
    const values = new Set(questionBlocks(doc, sec).slice(1).map(b => { try { return Math.round(parse(doc.getParaPropertiesAt?.(sec, b.start) ?? '{}')?.spacingBefore || 0); } catch { return 0; } }));
    if (values.size > 1) return true;
  }
  return false;
}

// 조합 선지: 〈보기〉 ㄱㄴㄷ·학생 A B C를 「있는 대로 고른」 문항에서 흔히 쓰는 다섯 조합. 커서 문단 뒤에 넣고 5열로 놓는다.
export const CHOICE_COMBOS = [
  ['ㄱ', 'ㄷ', 'ㄱ, ㄴ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ'],
  ['ㄱ', 'ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ'],
  ['ㄴ', 'ㄷ', 'ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄱ, ㄴ, ㄷ'],
  ['ㄱ', 'ㄴ', 'ㄷ', 'ㄱ, ㄷ', 'ㄴ, ㄷ'],
  ['A', 'C', 'A, B', 'B, C', 'A, B, C'],
  ['A', 'B', 'A, C', 'B, C', 'A, B, C'],
];
export function insertChoiceCombo(bridge, index) {
  const combo = CHOICE_COMBOS[index]; if (!combo) throw new Error('조합을 다시 고르세요.');
  const { input, doc } = requireDocument(bridge), pos = input.getCursorPosition();
  if (pos.cellPath?.length || input.cursor.isInCell?.()) throw new Error('표 밖 본문(발문 줄)에 커서를 두고 누르세요.');
  const sec = pos.sectionIndex, para = pos.paragraphIndex, line = combo.map((c, i) => `${CIRCLED[i]} ${c}`).join(' ');
  bridge.transaction('choice-combo', () => {
    parse(doc.splitParagraph(sec, para, doc.getParagraphLength(sec, para)));
    doc.insertText(sec, para + 1, 0, line);
    return true;
  });
  input.cursor.moveTo({ sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 });
  relayoutChoices(bridge, 5);
  return line;
}

// 문항을 그림으로: 문항이 처음 놓인 쪽·단에서 그 문항 글·표·그림·수식이 차지한 영역(px, 쪽 원점). 교사용 줄([정답]·[해설] 등)은 뺀다.
// {page, x, y, w, h} — 문항이 다음 단·쪽으로 이어지면 첫 단만.
const TEACHER_LINE = /^\s*(?:[\[【〈<(]\s*(?:정답|해설|풀이|채점\s*기준|교사용|출처|메모|성취기준|난이도|내용\s*영역)|(?:정답|해설|풀이)\s*[:：])/;
export function questionRegion(doc, q) {
  const sec = q.sec ?? 0, keep = new Set();
  for (let p = q.start; p < q.end; p++) if (!TEACHER_LINE.test(paragraphText(doc, sec, p))) keep.add(p);
  try { doc.flushDeferredPagination?.(); } catch {}
  for (let pg = 0; pg < doc.pageCount(); pg++) {
    const info = parse(doc.getPageInfo(pg)), boxes = [];
    for (const r of parse(doc.getPageTextLayout(pg)).runs || []) if (r.secIdx === sec && !r.cellPath?.length && keep.has(r.paraIdx) && String(r.text || '').trim()) boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    for (const c of parse(doc.getPageControlLayout(pg)).controls || []) if ((c.secIdx ?? sec) === sec && !c.cellPath?.length && !Number.isInteger(c.cellIdx) && keep.has(c.paraIdx) && Number.isFinite(c.y)) boxes.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    if (!boxes.length) continue;
    const cols = info.columns?.length ? info.columns : [{ x: info.bodyLeft, width: info.bodyRight - info.bodyLeft }];
    const colOf = x => { const i = cols.findIndex(c => x < c.x + c.width + 4); return i < 0 ? cols.length - 1 : i; };
    const first = boxes.reduce((a, b) => (colOf(a.x) < colOf(b.x) || (colOf(a.x) === colOf(b.x) && a.y <= b.y) ? a : b)), col = cols[colOf(first.x)];
    const inCol = boxes.filter(b => colOf(b.x) === colOf(first.x)), top = Math.min(...inCol.map(b => b.y)), bottom = Math.max(...inCol.map(b => b.y + b.h));
    return { page: pg, x: col.x - 4, y: top - 6, w: col.width + 8, h: bottom - top + 12, width: info.width, height: info.height };
  }
  return null;
}

// 5E_hwp 집중 도구 줄의 새 조판 기능(10-21). 모두 한 번의 되돌리기 단계(bridge.transaction)로 문서를 고친다.
// 그림 칸 너비 맞춤 · 그림 2×N 표 · 표를 단 폭에 맞춤 · 문항 번호 다시 매기기 · 선지 배열 바꾸기 · 조판 점검.
import { insertTable, mm, read } from './hwp-palette/native.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
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

// 본문 문단 머리의 「3.」 같은 문항 번호를 1부터 차례로 다시 매긴다(표·머리말 안은 건드리지 않음).
export function renumberQuestions(bridge) {
  const { doc } = requireDocument(bridge);
  const found = [];
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let para = 0; para < doc.getParagraphCount(sec); para++) {
      const m = /^(\s*)(\d{1,3})\.(?=\s|\S)/.exec(paragraphText(doc, sec, para));
      if (m) found.push({ sec, para, offset: m[1].length, digits: m[2] });
    }
  if (!found.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
  const changes = found.map((f, i) => ({ ...f, next: String(i + 1) })).filter(f => f.next !== f.digits);
  if (!changes.length) return 0;
  bridge.transaction('renumber-questions', () => {
    for (const f of changes) {
      doc.deleteText(f.sec, f.para, f.offset, f.digits.length);
      doc.insertText(f.sec, f.para, f.offset, f.next);
    }
    return true;
  });
  return changes.length;
}

// 커서 근처의 선지(①~⑤)를 1열(줄마다)·3열(①②③ / ④⑤)·5열(한 줄)로 다시 놓는다. 팔레트의 선지 조판과 같은 방식(테두리 없는 표).
export function relayoutChoices(bridge, columns) {
  if (![1, 3, 5].includes(columns)) throw new Error('선지는 1열·3열·5열로 놓을 수 있습니다.');
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
    const sec = pos.sectionIndex, has = p => p >= 0 && p < doc.getParagraphCount(sec) && /[①②③④⑤]/.test(paragraphText(doc, sec, p));
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
  const labelled = options.map((s, i) => `${CIRCLED[i]} ${s}`);
  const width = columnWidth(doc, block.sec);
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
  return true;
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
export function questionBlocks(doc, sec = 0) {
  const count = doc.getParagraphCount(sec), starts = [];
  for (let p = 0; p < count; p++) { const m = /^\s*(\d{1,3})\./.exec(paragraphText(doc, sec, p)); if (m) starts.push({ start: p, number: Number(m[1]) }); }
  return starts.map((s, i) => ({ ...s, end: i + 1 < starts.length ? starts[i + 1].start : count, preview: paragraphText(doc, sec, s.start).replace(/^\s*\d{1,3}\.\s*/, '').slice(0, 40) }));
}

// 문항 순서 바꾸기: index번째 문항을 위(-1)·아래(+1) 문항과 바꾼 뒤 번호를 다시 매긴다. 서식·표·그림은 내부 복사로 그대로 옮긴다.
export function moveQuestion(bridge, index, direction) {
  const { doc } = requireDocument(bridge), sec = 0, blocks = questionBlocks(doc, sec);
  const a = direction < 0 ? index - 1 : index;
  if (!blocks[a] || !blocks[a + 1]) throw new Error(direction < 0 ? '맨 위 문항입니다.' : '맨 아래 문항입니다.');
  bridge.transaction('move-question', () => swapAdjacentQuestions(doc, sec, blocks, a));
  try { renumberQuestions(bridge); } catch {}
  return a + (direction < 0 ? 0 : 1);
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
  let n = 0;
  for (let sec = 0; sec < doc.getSectionCount(); sec++)
    for (let para = 0; para < doc.getParagraphCount(sec); para++) {
      const m = /^(\s*)(\d{1,3})\.(?=\s|\S)/.exec(paragraphText(doc, sec, para)); if (!m) continue;
      const next = String(++n); if (next === m[2]) continue;
      doc.deleteText(sec, para, m[1].length, m[2].length); doc.insertText(sec, para, m[1].length, next);
    }
  return n;
}
function checkedResult(value) { const r = parse(value); if (r?.ok === false) throw new Error(r.error || '문항을 옮기지 못했습니다.'); return r; }

// 쪽·단 경계에서 나뉜 문항 찾기: 문항 묶음의 글이 두 쪽(또는 두 단)에 걸치면 알린다.
export function splitQuestions(doc, sec = 0) {
  const blocks = questionBlocks(doc, sec); if (!blocks.length) return [];
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
    if (spots.size > 1) issues.push({ text: `${b.number}번 문항이 ${columns > 1 ? '쪽·단' : '쪽'} 경계에서 나뉩니다(${[...spots].map(s => { const [pg, c] = s.split(':'); return columns > 1 ? `${+pg + 1}쪽 ${+c + 1}단` : `${+pg + 1}쪽`; }).join(' → ')}).`, at: { sectionIndex: sec, paragraphIndex: b.start, charOffset: 0 } });
  }
  return issues;
}

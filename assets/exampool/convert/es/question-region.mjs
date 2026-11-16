// Question regions for the live converter.
//
// The index keeps one box per question, but a printed KICE question can run past the bottom of its
// column and continue at the top of the next column or page, its box can stop before the choices,
// and some questions print ①~⑤ inside a picture. These helpers rebuild the region from the printed
// page: find the question's own number, read down its column until the next question number or set
// header, continue into the next column or page when the question reaches the column end, and place
// the continuation under the first part so buildLiveStructure reads one region.
// Boxes are [x0, top0, x1, top1] in page points with a top-left origin; text items keep pdf.js
// coordinates (bottom-left origin).
import { inQuestion } from './live-fonts.mjs';
import { drawingPrimitives } from './pdf-drawings.mjs?v=readability-20261004-4';

export const SPLIT_FAILURE = '원본 PDF에서 본문과 선지 다섯 개를 모두 분리하지 못했습니다.';
export const PLACEHOLDER = '(선지는 원본 참고)';
export const NOTES = {
  continued: '문항이 다음 단이나 다음 쪽으로 이어져 이어진 부분까지 함께 변환했습니다.',
  extended: '색인의 문항 영역이 원본과 달라 원본 PDF에서 다음 문항 번호 앞까지를 문항 영역으로 다시 잡았습니다.',
  // Same wording as the drawn-choice branch of buildLiveStructure.
  picture: '선지가 그림이거나 자동으로 옮길 수 없어 선지 자리에는 원본 참고 표시만 넣었습니다.',
};

const LABELS = ['①', '②', '③', '④', '⑤'];
const START = /^\s*(\d{1,2})\.(?!\d)/u;
const SET_HEADER = /^\s*\[\s*\d{1,2}\s*[～~∼〜-]\s*\d{1,2}\s*\]/u;
// Page furniture that ends a column. "확인 사항" closes the last page of a paper.
const FOOTER = /저작권은\s*한국교육과정평가원|확인\s*사항|\d\s*권\s*중\s*\d\s*권/u;
const PAPER_END = /확인\s*사항/u;

const equationFont = (pdf, item) => /^(?:HyhwpEQ|HYhwpEQ)/u.test(pdf.fonts?.[item.fontName]?.name?.split('+').at(-1) || '');
const hasContent = (block) => block.runs?.some((run) => (run.kind === 'equation' ? run.script?.trim() : run.value?.trim()));
export const hasEmptyChoice = (structure) => structure.inlineChoices === true
  ? structure.blocks.flatMap((block) => (block.runs || []).filter((run) => run.kind === 'text')
    .flatMap((run) => run.value.match(/[①②③④⑤]/gu) || [])).join('') !== LABELS.join('')
  : structure.blocks.some((block) => block.role === 'choice' && !hasContent(block));
const blockText = (block) => block.runs.map((run) => (run.kind === 'equation' ? run.script : run.value)).join('');
const compact = (value) => value.normalize('NFC').replace(/[\s`]/gu, '');
const fifthText = (structure) => structure.inlineChoices === true
  ? structure.blocks.filter((block) => Array.isArray(block.runs)).map(blockText).join(' ').split('⑤').at(-1)
  : structure.blocks.filter((block) => block.role === 'choice' && block.label === '⑤').map(blockText).join(' ');

function incompleteFifth(question, structure) {
  const source = question.questionText || question.text || '';
  if (!source.includes('⑤')) return false;
  const actual = compact(fifthText(structure)), expected = compact(source.split('⑤').at(-1));
  return actual.length > 0 && expected.startsWith(actual) && expected.length > actual.length;
}

/** The page column [left, right] that holds a box, or null when the box spans both columns. */
export function columnOf(pdf, box) {
  const width = pdf.pageWidth;
  if (!width || box[2] - box[0] > width * 0.6) return null;
  const middle = width / 2;
  return (box[0] + box[2]) / 2 < middle ? [0, middle] : [middle, width];
}

/** Text lines of one column, top to bottom. Equation glyphs never open or close a question. */
export function columnLines(pdf, [left, right]) {
  const items = pdf.content.items.filter((item) => typeof item.str === 'string' && item.str.trim() && item.transform
    && !equationFont(pdf, item) && item.transform[4] >= left - 2 && item.transform[4] < right - 2);
  const lines = [];
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const line = lines.find((entry) => Math.abs(entry.y - item.transform[5]) < 2.5);
    if (line) line.items.push(item);
    else lines.push({ y: item.transform[5], items: [item] });
  }
  return lines.map((line) => {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    return { top: pdf.pageHeight - line.y, x: line.items[0].transform[4],
      height: Math.max(...line.items.map((item) => item.height || 0)),
      text: line.items.map((item) => item.str).join(''), items: line.items };
  }).sort((a, b) => a.top - b.top);
}

/** A printed number or a set header such as [8～10] at the column margin opens a question. */
function opensQuestion(line, margin) {
  const match = line.items[0].str.match(START);
  if (match) return Math.abs(line.x - margin) <= 4 ? Number(match[1]) : null;
  return SET_HEADER.test(line.text) && Math.abs(line.x - margin) <= 12 ? 'set' : null;
}

// Running heads: large section titles, the page number and the 홀수형/짝수형 tag.
const isHeader = (pdf, line) => line.top < pdf.pageHeight * 0.2
  && (line.height >= 18 || /^\s*(?:짝수형|홀수형|\d{1,2})\s*$/u.test(line.text));

/** Lines from lines[from] down to the next question or footer. The first line may be the question's own number. */
function readDown(lines, from, margin, ownFirst) {
  const body = [];
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index];
    if (FOOTER.test(line.text)) return { body, stop: line };
    if ((body.length || !ownFirst) && opensQuestion(line, margin) !== null) return { body, stop: line };
    body.push(line);
  }
  return { body, stop: null };
}

const markersOf = (lines) => lines.flatMap((line) => [...line.text].filter((char) => LABELS.includes(char))).join('');
const leftmost = (lines) => Math.min(...lines.map((line) => line.x));

/** The question's printed number near the top of its indexed box, with the column it opens. */
export function ownRegion(question, pdf) {
  const column = columnOf(pdf, question.box);
  if (!column) return null;
  const lines = columnLines(pdf, column);
  const [, top, , bottom] = question.box;
  const candidates = lines.map((line, index) => ({ line, index }))
    .filter(({ line }) => Number(line.items[0].str.match(START)?.[1]) === question.no
      && line.top >= top - 30 && line.top <= bottom + 3)
    .sort((a, b) => Math.abs(a.line.top - top) - Math.abs(b.line.top - top));
  if (!candidates.length) return null;
  const { line, index } = candidates[0];
  const { body, stop } = readDown(lines, index, line.x, true);
  // Without a stop the question owns the rest of its column, including pictures below its last line.
  const box = [question.box[0], line.top - 10, question.box[2], stop ? stop.top - 4 : pdf.pageHeight - 10];
  return { column, box, lines: body, margin: line.x, stop, top: line.top };
}

/** The part of the next column (or the next page's first column) that continues the question. */
export async function continuationRegion(question, pdf, column, readPage) {
  const middle = pdf.pageWidth / 2;
  const onRight = column[0] >= middle - 1;
  let next = pdf;
  if (onRight) {
    try { next = await readPage(question.page + 1); } catch { return null; }
    if (!next) return null;
  }
  const nextColumn = onRight ? [0, next.pageWidth / 2] : [middle, pdf.pageWidth];
  const lines = columnLines(next, nextColumn);
  const first = lines.findIndex((line) => !isHeader(next, line));
  if (first < 0) return null;
  const numbered = lines.filter((line) => START.test(line.items[0].str) || SET_HEADER.test(line.text));
  const margin = numbered.length ? Math.min(...numbered.map((line) => line.x)) : -Infinity;
  const { body, stop } = readDown(lines, first, margin, false);
  if (!body.length) return null;
  return { pdf: next, lines: body,
    box: [nextColumn[0], body[0].top - 10, nextColumn[1], stop ? stop.top - 4 : body.at(-1).top + 4] };
}

/**
 * One virtual page: the first region as printed, then the second region (another column or page)
 * moved directly below it. Drawing operators of the second page move with its text so figure
 * labels are still recognised.
 */
export function joinRegions(pdf, box, next, nextBox, dx) {
  // The second page's top edge lands 20pt under the first region, so its running head and
  // anything above the continuation stay outside the joined box.
  const shift = box[3] + 20;
  const dy = pdf.pageHeight - next.pageHeight - shift;
  const move = (item) => ({ ...item, transform: [...item.transform.slice(0, 4), item.transform[4] + dx, item.transform[5] + dy] });
  const within = (source, region) => (item) => inQuestion(item, { box: region }, source.pageHeight);
  const items = [...pdf.content.items.filter(within(pdf, box)), ...next.content.items.filter(within(next, nextBox)).map(move)];
  const joined = { ...pdf, content: { ...pdf.content, items },
    figureSourceRegions: [
      { page: pdf.pageNumber, flowBox: box, sourceBox: box, dx: 0, dy: 0 },
      { page: next.pageNumber || pdf.pageNumber, sourceBox: nextBox,
        flowBox: nextBox.map((v, i) => v + (i % 2 ? shift : dx)), dx, dy: shift },
    ],
    fonts: { ...next.fonts, ...pdf.fonts },
    glyphs: next === pdf ? pdf.glyphs : [...(pdf.glyphs || []), ...(next.glyphs || [])] };
  if (pdf.equationItems) {
    joined.equationItems = [...pdf.equationItems.filter(within(pdf, box)),
      ...(next.equationItems || []).filter(within(next, nextBox)).map(move)];
  }
  if (pdf.operations && next.operations && pdf.OPS) {
    const { OPS } = pdf;
    joined.operations = {
      fnArray: [...pdf.operations.fnArray, OPS.save, OPS.transform, ...next.operations.fnArray, OPS.restore],
      argsArray: [...pdf.operations.argsArray, null, [1, 0, 0, 1, dx, dy], ...next.operations.argsArray, null],
    };
  } else delete joined.operations;
  return { pdf: joined, box: [box[0], box[1], box[2], nextBox[3] + shift] };
}

// Letters only: legacy fonts turn mass and atomic numbers into digits or scripts in one source only.
const letters = (text) => text.normalize('NFC').replace(/[^\p{L}]/gu, '');

/** The first letters of the question in the index text, after its number. */
export function indexOpening(question) {
  const source = question.questionText || question.text || '';
  const lines = source.split('\n');
  const number = new RegExp('^\\s*' + question.no + '\\.(?!\\d)', 'u');
  const at = lines.findIndex((line) => number.test(line));
  if (at < 0) return '';
  return letters(lines.slice(at).join('').replace(number, '')).slice(0, 6);
}

/** The recovered stem must open with the question's own words, never with another question. */
function opensLikeIndex(question, structure) {
  const opening = indexOpening(question);
  const stem = letters(structure.blocks.filter((block) => block.role !== 'choice').map(blockText).join(''));
  return opening.length >= 4 && stem.startsWith(opening);
}

/** Raster images of a real size inside a region, below the question number. */
function picturesIn(pdf, box, top) {
  if (!pdf.operations || !pdf.OPS) return [];
  const width = box[2] - box[0];
  return drawingPrimitives(pdf.operations, pdf.OPS, pdf.pageHeight).filter((shape) => shape.type === 'image'
    && shape.box[0] < box[2] && shape.box[2] > box[0] && shape.box[1] >= top && shape.box[3] <= box[3] + 12
    && shape.box[2] - shape.box[0] >= width * 0.4 && shape.box[3] - shape.box[1] >= 30);
}

async function buildRegion(question, region, { build, glyphMap }) {
  const located = { ...question, box: region.box };
  return build(located, region.pdf, await glyphMap(located, region.pdf));
}

/**
 * Stem-only structure with five placeholders, for choices printed inside a picture. Used only when
 * the text layer and the index both lack ①~⑤, a picture fills the question below its number, and
 * the stem is readable text that asks the question.
 */
async function pictureStructure(question, region, deps) {
  const index = question.questionText || question.text || '';
  if (question.responseType === 'short_answer' || /[①②③④⑤]/u.test(index)
    || !picturesIn(region.pdf, region.box, region.top).length) return null;
  const structure = await buildRegion({ ...question, responseType: 'short_answer' }, region, deps);
  if (structure.blocks.some((block) => block.role === 'choice')) return null;
  // Viewer watermarks such as "한글과컴퓨터 오피스" are not question text.
  structure.blocks = structure.blocks.filter((block) => !/^\s*한글과컴퓨터/u.test(blockText(block)));
  const stem = structure.blocks.map(blockText).join(' ');
  // The stem must read as a Korean question: papers whose Hangul lacks a text mapping leave
  // only Latin letters and punctuation behind, and those are refused.
  const hangul = (stem.match(/[가-힣]/gu) || []).length;
  if (hangul < 12 || hangul < stem.replace(/\s/gu, '').length * 0.3 || !/[?？]|고르시오/u.test(stem.slice(-150))) return null;
  structure.blocks.push(...LABELS.map((label) => ({ role: 'choice', label, runs: [{ kind: 'text', value: PLACEHOLDER }] })));
  structure.notes.push(NOTES.picture);
  return structure;
}

async function recover(question, pdf, deps) {
  const own = ownRegion(question, pdf);
  if (!own) return null;
  let region = { pdf, box: own.box, lines: own.lines, top: own.top };
  let note = NOTES.extended;
  // A question that reaches the end of its column may continue in the next column or page.
  const reachesEnd = !own.stop || (FOOTER.test(own.stop.text) && !PAPER_END.test(own.stop.text));
  const ownStructure = reachesEnd && markersOf(own.lines) === '①②③④⑤' ? await buildRegion(question, region, deps) : null;
  const tail = reachesEnd && (markersOf(own.lines) !== '①②③④⑤' || (ownStructure && incompleteFifth(question, ownStructure)))
    ? await continuationRegion(question, pdf, own.column, deps.readPage) : null;
  if (tail) {
    if (markersOf([...own.lines, ...tail.lines]) !== '①②③④⑤') return null;
    const joined = joinRegions(pdf, own.box, tail.pdf, tail.box, leftmost(own.lines) - leftmost(tail.lines));
    region = { ...joined, lines: [...own.lines, ...tail.lines], top: own.top };
    note = NOTES.continued;
  }
  const markers = markersOf(region.lines);
  let structure = null;
  if (markers === '①②③④⑤') {
    structure = await buildRegion(question, region, deps);
    if (hasEmptyChoice(structure)) return null;
    structure.notes.push(note);
  } else if (!markers) {
    structure = await pictureStructure(question, region, deps);
  }
  return structure && opensLikeIndex(question, structure) ? structure : null;
}

/**
 * Runs the normal conversion and, only when it cannot separate the stem and five choices (or
 * leaves a choice empty), rebuilds the question region from the printed page. Other errors and
 * complete results pass through unchanged; if recovery is not certain the original outcome stands.
 * deps: { build(question, pdf, glyphs), glyphMap(question, pdf), readPage(pageNumber) }.
 */
export async function recoverQuestionRegion(question, pdf, primary, deps) {
  let structure = null;
  let failure = null;
  try { structure = await primary(); } catch (error) { failure = error; }
  if (structure && !hasEmptyChoice(structure) && !incompleteFifth(question, structure)) return structure;
  if (failure && failure.message !== SPLIT_FAILURE) throw failure;
  let recovered = null;
  try { recovered = await recover(question, pdf, deps); } catch { recovered = null; }
  if (recovered && structure && !hasEmptyChoice(structure)) {
    const before = compact(fifthText(structure)), after = compact(fifthText(recovered));
    if (!after.startsWith(before) || after.length <= before.length) return structure;
    const text = (value) => compact(value.blocks.filter((block) => Array.isArray(block.runs)).map(blockText).join(''));
    const existing = [...text(structure)];
    let at = 0;
    for (const char of text(recovered)) if (char === existing[at]) at += 1;
    if (at !== existing.length) return structure;
  }
  if (recovered) return recovered;
  if (failure) throw failure;
  return structure;
}

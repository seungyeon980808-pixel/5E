// 학교 양식(한글 파일)에서 조판 기준 만들기(10-22 조판 기준 C-6, 설계 4·8절 5단계).
// 학교 시험지 양식을 한글 엔진으로 열어 쪽 설정(용지·여백·단), 「1.」 같은 문항 문단에서 가장 많이 쓴 글자·문단 모양을 읽는다.
// 찾은 값과 못 찾은 값(→ 수능 틀 값)을 표로 보여 주고, 이름을 붙여 저장한다. 머리말·꼬리말(학교 이름 등)은 범위 밖.
import { KICE_STANDARD, copyStandard, validateStandard } from './typeset-standard.js';
import { PAPER_MM } from './typeset-model.js';

const HU = 7200 / 25.4;
const J = v => typeof v === 'string' ? JSON.parse(v) : v;
const mm = hu => Math.round(hu / HU * 2) / 2;
// 「1.」「1)」에 더해 「Q1.」「문 1.」「[1]」 번호도 문항으로 본다(11-02 밤샘 가짜 양식 f14·f05·f08 — 예시 문항이 안 지워지고 남았음).
const QUESTION = /^\s*(?:문\s*|Q\s*|\[\s*)?(\d{1,2})\s*[.)．\]]\s*\S/;
// 문항 문단: 「1.」처럼 번호를 글자로 적었거나, 한글 「문단 번호」(headType Number)로 번호가 붙은 문단(10-29 대왕중 양식: 1~15번은 문단 번호, 16번부터 글자).
const numbered = doc => (p, len) => { if (len >= 3 && QUESTION.test(doc.getTextRange(0, p, 0, Math.min(len, 40)))) return 'text'; try { const pp = J(doc.getParaPropertiesAt(0, p)); if (len && String(pp.headType).toLowerCase() === 'number' && !pp.paraLevel) return 'auto'; } catch {} return ''; };
// 문항 뒤 꼬리(「◇ 끝 ◇」, 답지 안내 등): 마지막 문항 뒤 짧은 「끝」 문단부터 끝까지는 양식으로 남긴다.
const TAIL = /^[\s◇◆○●□■<>〈〉\-─―=*※()（）\[\]【】]*끝[\s◇◆○●□■<>〈〉\-─―=*.()（）\[\]【】]*$/;
const NEXT = /(다음|뒷)\s*(면|쪽|장)\s*에?\s*계속/;
const mode = list => { const count = new Map(); for (const v of list) count.set(v, (count.get(v) || 0) + 1); return [...count].sort((a, b) => b[1] - a[1])[0]?.[0]; };

// doc: rhwp 문서(열린 학교 양식). 돌려주는 rows는 대화상자 표, standard는 저장할 기준.
export function readSchoolForm(doc, { fileName = '학교 양식', name } = {}) {
  const rows = [], over = { paper: { margin: {} }, text: {} };
  const row = (label, value, found, note = '') => rows.push({ label, value, found, note });
  // 쪽
  const page = J(doc.getPageDef(0));
  let w = page.width / HU, h = page.height / HU; if (page.landscape) [w, h] = [h, w];
  const paper = Object.entries(PAPER_MM).find(([, [pw, ph]]) => Math.abs(pw - w) < 3 && Math.abs(ph - h) < 3)?.[0];
  if (paper) { over.paper.size = paper; row('용지', paper, true); } else row('용지', `${KICE_STANDARD.paper.size}(수능 틀)`, false, `${Math.round(w)}×${Math.round(h)}mm — 아는 용지 크기가 아님`);
  for (const [k, label] of [['top', '위'], ['bottom', '아래'], ['left', '왼쪽'], ['right', '오른쪽']]) {
    const v = mm(page['margin' + k[0].toUpperCase() + k.slice(1)]);
    if (v >= 5 && v <= 40) { over.paper.margin[k] = v; row(`여백 ${label}`, `${v}mm`, true); } else row(`여백 ${label}`, `${KICE_STANDARD.paper.margin[k]}mm(수능 틀)`, false, `${v}mm — 5~40mm 밖`);
  }
  let col = null; try { col = J(doc.getColumnDef(0)); } catch {}
  if (col && [1, 2, 3, 4].includes(col.columnCount)) {
    over.paper.columns = col.columnCount; row('단', `${col.columnCount}단`, true);
    if (col.columnCount === 2) { const g = mm(col.spacing || 0); if (g >= 0 && g <= 30) { over.paper.columnGap = g; row('단 간격', `${g}mm`, true); } }
  } else row('단', `${KICE_STANDARD.paper.columns}단(수능 틀)`, false, '단 설정을 읽지 못함');
  // 문항 문단: 「1.」「2)」로 시작하는 문단에서 머리 뒤 글자 모양
  const heads = [], isQ = numbered(doc), texts = [];
  for (let p = 0, n = doc.getParagraphCount(0); p < n; p++) {
    const len = doc.getParagraphLength(0, p); if (len) texts.push(doc.getTextRange(0, p, 0, len));
    const kind = len >= 4 ? isQ(p, len) : ''; if (!kind) continue;
    const t = doc.getTextRange(0, p, 0, Math.min(len, 40)), m = kind === 'text' ? t.match(QUESTION) : null;
    const at = m ? Math.min(len - 1, m[0].length - 1) : 0;
    try { heads.push({ c: J(doc.getCharPropertiesAt(0, p, at)), p: J(doc.getParaPropertiesAt(0, p)), n: m ? J(doc.getCharPropertiesAt(0, p, t.search(/\d/))) : null }); } catch {}
  }
  if (heads.length) {
    const font = mode(heads.map(x => x.c.fontFamily)), size = mode(heads.map(x => x.c.fontSize / 100)), ratio = mode(heads.map(x => x.c.ratios?.[0] ?? 100)), spacing = mode(heads.map(x => x.c.spacings?.[0] ?? 0));
    const percent = heads.filter(x => String(x.p.lineSpacingType).toLowerCase() === 'percent'), line = percent.length ? Math.round(mode(percent.map(x => x.p.lineSpacing))) : null;
    const align = mode(heads.map(x => String(x.p.alignment || '').toLowerCase()));
    // 한글 줄 나눔(koreanBreakUnit 1 = 글자, 0 = 어절): 문항 문단의 1/3 넘게 글자 단위면 글자 — 좁은 단에서 어절 + 양쪽 맞춤은 띄어쓰기가 크게 벌어진다.
    const chars = heads.filter(x => x.p.koreanBreakUnit === 1).length, brk = chars * 3 > heads.length ? 'char' : 'word';
    over.text.break = brk; row('줄 나눔', brk === 'char' ? '글자 단위' : '어절 단위', true);
    const put = (key, value, ok, label, shown) => { if (ok) { over.text[key] = value; row(label, shown, true); } else row(label, `${KICE_STANDARD.text[key]}(수능 틀)`, false, `${shown} — 범위 밖`); };
    row('문항 문단', `${heads.length}개`, true, '「1.」처럼 번호로 시작하는 문단에서 읽음');
    if (font) { over.text.font = font; row('글꼴', font, true); }
    put('size', size, size >= 6 && size <= 20, '글자 크기', `${size}pt`);
    put('ratio', ratio, ratio >= 50 && ratio <= 200, '장평', `${ratio}%`);
    put('spacing', spacing, spacing >= -50 && spacing <= 50, '자간', `${spacing}%`);
    if (line) put('lineSpacing', line, line >= 80 && line <= 300, '줄 간격', `${line}%`); else row('줄 간격', `${KICE_STANDARD.text.lineSpacing}%(수능 틀)`, false, '고정 값 줄 간격이라 읽지 않음');
    if (['justify', 'left', 'distribute'].includes(align)) { over.text.align = align; row('정렬', { justify: '양쪽', left: '왼쪽', distribute: '배분' }[align], true); }
    // 번호 모양: 글자로 적은 번호의 굵기(문단 번호만 쓴 양식은 굵게 두지 않는다 — 한글 기본 문단 번호는 본문 글자 그대로).
    const nums = heads.filter(x => x.n), bold = nums.length ? mode(nums.map(x => !!x.n.bold)) : false;
    over.parts = { ...(over.parts || {}), numberBold: bold, numberPlus: 0 }; row('번호', bold ? '굵게 「1.」' : '보통 「1.」', true);
  } else row('문항 문단', '못 찾음', false, '「1.」처럼 번호로 시작하는 문단이 없어 글자 모양은 수능 틀 값');
  // 배점 표기: 양식에 「(3점)」이 「[3점]」보다 많으면 둥근 괄호.
  const all = texts.join('\n'), round = (all.match(/\(\s*\d+(?:\.\d+)?\s*점\s*\)/g) || []).length, square = (all.match(/\[\s*\d+(?:\.\d+)?\s*점\s*\]/g) || []).length;
  if (round || square) { over.parts = { ...(over.parts || {}), points: round > square ? 'round' : 'square' }; row('배점', round > square ? '(3점)' : '[3점]', true); }
  const base = copyStandard(KICE_STANDARD, { name: name || String(fileName).replace(/\.(hwpx?|HWPX?)$/, '') || '학교 양식', source: { kind: 'hwp', file: fileName } });
  const standard = { ...base, paper: { ...base.paper, ...over.paper, margin: { ...base.paper.margin, ...over.paper.margin } }, text: { ...base.text, ...over.text }, parts: { ...base.parts, ...(over.parts || {}) } };
  validateStandard(standard);
  return { rows, standard };
}

// 양식 구조(10-22 S1): 시험지를 이 양식 위에 묶을 때 쓸 자리. 「첫 문항 문단」부터 끝까지가 문항 자리, 그 앞(학교 이름·시험 제목 표 등)은 그대로 둔다.
export function formStructure(doc) {
  const out = { pages: 0, columns: 1, firstQuestion: -1, lastQuestion: -1, tailStart: -1, questions: 0, headTables: 0, paragraphs: 0, header: false, footer: false, parts: [], nextMark: -1, nextMarks: 0 };
  try { out.pages = doc.pageCount(); } catch {}
  try { out.columns = J(doc.getColumnDef(0)).columnCount || 1; } catch {}
  out.paragraphs = doc.getParagraphCount(0);
  const isQ = numbered(doc);
  for (let p = 0; p < out.paragraphs; p++) {
    const len = doc.getParagraphLength(0, p); if (len < 3) continue;
    if (isQ(p, len)) { out.questions++; if (out.firstQuestion < 0) out.firstQuestion = p; out.lastQuestion = p; if (out.questions <= 12) (out.questionParas ||= []).push(p); }
  }
  // 꼬리: 마지막 문항 뒤 첫 「끝」 문단(없으면 -1 — 끝까지 문항 자리).
  if (out.lastQuestion >= 0) for (let p = out.lastQuestion + 1; p < out.paragraphs; p++) { const len = doc.getParagraphLength(0, p); if (len && len <= 16 && TAIL.test(doc.getTextRange(0, p, 0, len))) { out.tailStart = p; break; } }
  // 머리 쪽 표(10-29 「남길 것」): 첫 표는 머리 표, 그 밖(1칸 상자)은 글과 함께 — 「[배점 현황]」 상자는 시험지에 맞춰 숫자를 바꾼다.
  if (out.pages) for (const c of J(doc.getPageControlLayout(0)).controls || []) if (!c.cellPath?.length && c.type === 'table' && (out.firstQuestion < 0 || c.paraIdx < out.firstQuestion)) {
    out.headTables++;
    const lines = []; if (c.rowCount === 1 && c.colCount === 1) { try { for (let k = 0, n = doc.getCellParagraphCount(0, c.paraIdx, c.controlIdx, 0); k < n; k++) lines.push(String(doc.getTextInCell(0, c.paraIdx, c.controlIdx, 0, k, 0, 400)).trim()); } catch {} }
    out.parts.push({ para: c.paraIdx, ctrl: c.controlIdx, kind: out.parts.length ? 'box' : 'head', lines, score: lines.some(t => /배점|문항\s*[×xX*]\s*\d/.test(t)) });
  }
  // 「☞ 다음 면에 계속」: 문항 자리 안에 있어 비울 때 같이 지워진다 — 묶은 뒤 마지막 쪽만 빼고 다시 붙인다(첫 표시 문단을 본으로).
  for (let p = Math.max(0, out.firstQuestion); p < out.paragraphs; p++) { const len = doc.getParagraphLength(0, p); if (len && len <= 30 && NEXT.test(doc.getTextRange(0, p, 0, len))) { out.nextMarks++; if (out.nextMark < 0) out.nextMark = p; } }
  for (const [k, header] of [['header', true], ['footer', false]]) { try { const info = J(doc.getHeaderFooterParaInfo(0, header, 0)); out[k] = !!info && !(info.ok === false); } catch { out[k] = false; } }
  return out;
}

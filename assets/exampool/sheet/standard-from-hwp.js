// 학교 양식(한글 파일)에서 조판 기준 만들기(10-22 조판 기준 C-6, 설계 4·8절 5단계).
// 학교 시험지 양식을 한글 엔진으로 열어 쪽 설정(용지·여백·단), 「1.」 같은 문항 문단에서 가장 많이 쓴 글자·문단 모양을 읽는다.
// 찾은 값과 못 찾은 값(→ 수능 틀 값)을 표로 보여 주고, 이름을 붙여 저장한다. 머리말·꼬리말(학교 이름 등)은 범위 밖.
import { KICE_STANDARD, copyStandard, validateStandard } from './typeset-standard.js';
import { PAPER_MM } from './typeset-model.js';

const HU = 7200 / 25.4;
const J = v => typeof v === 'string' ? JSON.parse(v) : v;
const mm = hu => Math.round(hu / HU * 2) / 2;
const QUESTION = /^\s*(\d{1,2})\s*[.)．]\s*\S/;
const mode = list => { const count = new Map(); for (const v of list) count.set(v, (count.get(v) || 0) + 1); return [...count].sort((a, b) => b[1] - a[1])[0]?.[0]; };

// doc: rhwp 문서(열린 학교 양식). 돌려주는 rows는 대화상자 표, standard는 저장할 기준.
export function readSchoolForm(doc, { fileName = '학교 양식', name } = {}) {
  const rows = [], over = { paper: { margin: {} }, text: {} };
  const row = (label, value, found, note = '') => rows.push({ label, value, found, note });
  // 쪽
  const page = J(doc.getPageDef(0));
  let w = page.width / HU, h = page.height / HU; if (page.landscape) [w, h] = [h, w];
  const paper = Object.entries(PAPER_MM).find(([, [pw, ph]]) => Math.abs(pw - w) < 3 && Math.abs(ph - h) < 3)?.[0];
  if (paper) { over.paper.size = paper; row('용지', paper, true); } else row('용지', `${KICE_STANDARD.paper.size}(수능 틀)`, false, `${Math.round(w)}×${Math.round(h)}mm — A4·B4·A3이 아님`);
  for (const [k, label] of [['top', '위'], ['bottom', '아래'], ['left', '왼쪽'], ['right', '오른쪽']]) {
    const v = mm(page['margin' + k[0].toUpperCase() + k.slice(1)]);
    if (v >= 5 && v <= 40) { over.paper.margin[k] = v; row(`여백 ${label}`, `${v}mm`, true); } else row(`여백 ${label}`, `${KICE_STANDARD.paper.margin[k]}mm(수능 틀)`, false, `${v}mm — 5~40mm 밖`);
  }
  let col = null; try { col = J(doc.getColumnDef(0)); } catch {}
  if (col && [1, 2].includes(col.columnCount)) {
    over.paper.columns = col.columnCount; row('단', `${col.columnCount}단`, true);
    if (col.columnCount === 2) { const g = mm(col.spacing || 0); if (g >= 0 && g <= 30) { over.paper.columnGap = g; row('단 간격', `${g}mm`, true); } }
  } else row('단', `${KICE_STANDARD.paper.columns}단(수능 틀)`, false, '단 설정을 읽지 못함');
  // 문항 문단: 「1.」「2)」로 시작하는 문단에서 머리 뒤 글자 모양
  const heads = [];
  for (let p = 0, n = doc.getParagraphCount(0); p < n; p++) {
    const len = doc.getParagraphLength(0, p); if (len < 4) continue;
    const t = doc.getTextRange(0, p, 0, Math.min(len, 40)), m = t.match(QUESTION); if (!m) continue;
    const at = Math.min(len - 1, m[0].length - 1);
    try { heads.push({ c: J(doc.getCharPropertiesAt(0, p, at)), p: J(doc.getParaPropertiesAt(0, p)) }); } catch {}
  }
  if (heads.length) {
    const font = mode(heads.map(x => x.c.fontFamily)), size = mode(heads.map(x => x.c.fontSize / 100)), ratio = mode(heads.map(x => x.c.ratios?.[0] ?? 100)), spacing = mode(heads.map(x => x.c.spacings?.[0] ?? 0));
    const percent = heads.filter(x => String(x.p.lineSpacingType).toLowerCase() === 'percent'), line = percent.length ? Math.round(mode(percent.map(x => x.p.lineSpacing))) : null;
    const align = mode(heads.map(x => String(x.p.alignment || '').toLowerCase()));
    const put = (key, value, ok, label, shown) => { if (ok) { over.text[key] = value; row(label, shown, true); } else row(label, `${KICE_STANDARD.text[key]}(수능 틀)`, false, `${shown} — 범위 밖`); };
    row('문항 문단', `${heads.length}개`, true, '「1.」처럼 번호로 시작하는 문단에서 읽음');
    if (font) { over.text.font = font; row('글꼴', font, true); }
    put('size', size, size >= 6 && size <= 20, '글자 크기', `${size}pt`);
    put('ratio', ratio, ratio >= 50 && ratio <= 200, '장평', `${ratio}%`);
    put('spacing', spacing, spacing >= -50 && spacing <= 50, '자간', `${spacing}%`);
    if (line) put('lineSpacing', line, line >= 80 && line <= 300, '줄 간격', `${line}%`); else row('줄 간격', `${KICE_STANDARD.text.lineSpacing}%(수능 틀)`, false, '고정 값 줄 간격이라 읽지 않음');
    if (['justify', 'left', 'distribute'].includes(align)) { over.text.align = align; row('정렬', { justify: '양쪽', left: '왼쪽', distribute: '배분' }[align], true); }
  } else row('문항 문단', '못 찾음', false, '「1.」처럼 번호로 시작하는 문단이 없어 글자 모양은 수능 틀 값');
  const base = copyStandard(KICE_STANDARD, { name: name || String(fileName).replace(/\.(hwpx?|HWPX?)$/, '') || '학교 양식', source: { kind: 'hwp', file: fileName } });
  const standard = { ...base, paper: { ...base.paper, ...over.paper, margin: { ...base.paper.margin, ...over.paper.margin } }, text: { ...base.text, ...over.text } };
  validateStandard(standard);
  return { rows, standard };
}

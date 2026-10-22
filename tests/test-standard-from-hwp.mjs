// 학교 양식에서 조판 기준 만들기(10-22 C-6): 쪽 설정·문항 문단의 글자/문단 모양을 읽고, 못 읽은 값은 수능 틀 값.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSchoolForm } from '../assets/exampool/sheet/standard-from-hwp.js';
import { KICE_STANDARD } from '../assets/exampool/sheet/typeset-standard.js';

const HU = 7200 / 25.4;
function fakeDoc({ page, columns = 2, gap = 10, paras }) {
  return {
    getPageDef: () => JSON.stringify({ width: Math.round(page[0] * HU), height: Math.round(page[1] * HU), marginLeft: Math.round(20 * HU), marginRight: Math.round(20 * HU), marginTop: Math.round(18 * HU), marginBottom: Math.round(18 * HU), landscape: false }),
    getColumnDef: () => JSON.stringify({ columnCount: columns, spacing: Math.round(gap * HU) }),
    getParagraphCount: () => paras.length,
    getParagraphLength: (_s, p) => paras[p].text.length,
    getTextRange: (_s, p, a, n) => paras[p].text.slice(a, a + n),
    getCharPropertiesAt: (_s, p) => JSON.stringify({ fontFamily: paras[p].font, fontSize: paras[p].size * 100, ratios: Array(7).fill(paras[p].ratio), spacings: Array(7).fill(paras[p].spacing) }),
    getParaPropertiesAt: (_s, p) => JSON.stringify({ alignment: 'justify', lineSpacing: paras[p].line, lineSpacingType: 'Percent' }),
  };
}
const q = (n, extra = {}) => ({ text: `${n}. 그림은 물체의 운동을 나타낸 것이다.`, font: '함초롬돋움', size: 10, ratio: 100, spacing: 0, line: 150, ...extra });

test('a B4 two-column school form: paper, margins, columns and the most used question text shape', () => {
  const doc = fakeDoc({ page: [257, 364], paras: [{ text: '2026학년도 1학기 중간고사', font: '맑은 고딕', size: 16, ratio: 100, spacing: 0, line: 100 }, q(1), q(2), q(3, { size: 9 }), { text: '① ㄱ ② ㄴ', font: '함초롬바탕', size: 10, ratio: 95, spacing: -5, line: 160 }] });
  const { rows, standard } = readSchoolForm(doc, { fileName: '○○고 중간고사.hwpx' });
  assert.equal(standard.name, '○○고 중간고사');
  assert.equal(standard.source.kind, 'hwp');
  assert.deepEqual(standard.paper, { size: 'B4', columns: 2, columnGap: 10, margin: { top: 18, bottom: 18, left: 20, right: 20 } });
  assert.deepEqual({ font: standard.text.font, size: standard.text.size, ratio: standard.text.ratio, spacing: standard.text.spacing, lineSpacing: standard.text.lineSpacing }, { font: '함초롬돋움', size: 10, ratio: 100, spacing: 0, lineSpacing: 150 });
  assert.ok(rows.some(r => r.label === '문항 문단' && r.value === '3개'), 'only numbered question paragraphs are read (not the title, not choices)');
  assert.equal(standard.gaps.bogiPadBottom, KICE_STANDARD.gaps.bogiPadBottom, 'what a form cannot say stays KICE');
  assert.notEqual(standard.id, 'kice');
});

test('unknown paper and no numbered paragraphs fall back to KICE values and say so', () => {
  const doc = fakeDoc({ page: [200, 280], columns: 3, paras: [{ text: '안내문입니다. 번호가 없습니다.', font: 'x', size: 11, ratio: 100, spacing: 0, line: 160 }] });
  const { rows, standard } = readSchoolForm(doc, { fileName: '안내.hwp' });
  assert.equal(standard.paper.size, KICE_STANDARD.paper.size);
  assert.equal(standard.paper.columns, KICE_STANDARD.paper.columns);
  assert.equal(standard.text.font, KICE_STANDARD.text.font);
  assert.ok(rows.filter(r => !r.found).length >= 3);
  assert.match(rows.find(r => r.label === '용지').note, /A4·B4·A3이 아님/);
});

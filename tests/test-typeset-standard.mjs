// 조판 기준(10-22 설계 8단계): 박혀 있던 값을 「수능 틀」로 옮겼고, 수능 틀로 만든 조판은 예전과 같다. 다른 기준은 실제로 출력에 닿는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { KICE_STANDARD, layoutValues, resolveStandard, copyStandard, exportStandard, importStandard, standardFor, validateStandard, mmToPx, pxToMm } from '../assets/exampool/sheet/typeset-standard.js';
import { buildQuestionHtml } from '../assets/exampool/sheet/handoff.js';
import { pageProfile, TEXT_RATIO, TEXT_SPACING, renderedContent } from '../assets/exampool/sheet/typeset-model.js';
import { FORMAT, validate } from '../assets/exampool/sheet/model.js';
const examples = JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json', import.meta.url), 'utf8'));
const prep = async f => ({ ...f, width: 320, height: 200 });
const measureText = (t, fs) => [...t].length * fs * 0.9;

// 10-23: 수능 틀 = 2009-6 모평 한글 원본 규칙 × 0.768(kice-form-analysis/rules-200906.md). px는 96dpi.
test('the built-in KICE standard carries the measured KICE rules scaled to the A4 column', () => {
  assert.ok(Object.isFrozen(KICE_STANDARD) && Object.isFrozen(KICE_STANDARD.paper.margin));
  assert.deepEqual(layoutValues(), { ratio: 95, spacing: -5, textSize: 11, lineSpacing: 160, gapText: 0, gapMaterial: 0, gapBogi: 0, askGap: 0, choicesGap: 0, margin: { top: 15, bottom: 15, left: 15, right: 15 }, columnGap: 8,
    bogiBottom: 8.69, bogiSide: 8.69, bogiTop: 5.82, bogiLeft: 8.69, bogiRight: 8.69, bogiTitle: '<보 기>', bogiTitleRow: 11, bogiTitleWidth: 46.34, bogiTitlePad: 1.44, bogiLineSpacing: 150, gapAfter: 1.54, boxSide: 8.69, boxTop: 5.82, boxBottom: 5.82,
    cellPad: 1.44, rule: '0.34pt solid #000', choiceTabs: [62.7, 104.5, 162.6], labelSpace: 'space', tableLineSpacing: 130, tableText: 10, numberIndent: 11.57 });
  assert.equal(TEXT_RATIO, 95); assert.equal(TEXT_SPACING, -5);
  for (const px of [3, 6, 14, 54]) assert.equal(mmToPx(pxToMm(px)), px);
});

test('KICE output is byte-identical to the default, a changed standard reaches the output', async () => {
  for (const q of examples.questions) {
    const plain = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText });
    const kice = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText, standard: KICE_STANDARD });
    assert.equal(kice.html, plain.html);
  }
  const q = examples.questions[0], wide = copyStandard(KICE_STANDARD, { name: '넓은 보기' });
  wide.parts.bogiTitleWidth = 20; wide.gaps.bogiPadSide = 3;
  const a = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText });
  const b = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText, standard: wide });
  assert.notEqual(b.html, a.html);
  assert.match(b.html, new RegExp(`width:${mmToPx(20)}px`), 'the title cutout follows the standard');
});

test('page profile reads margins and column gap from the standard', () => {
  assert.deepEqual(pageProfile({ paper: 'A4', columns: 2 }, KICE_STANDARD), pageProfile({ paper: 'A4', columns: 2 }));
  const s = copyStandard(KICE_STANDARD, { name: '학교' }); s.paper.margin.left = 20; s.paper.columnGap = 10;
  const p = pageProfile({ paper: 'A4', columns: 2 }, s), k = pageProfile({ paper: 'A4', columns: 2 });
  assert.ok(p.page.marginLeft > k.page.marginLeft && p.width < k.width && p.spacing > k.spacing);
});

test('copy, export and import round-trip; the KICE standard cannot be overwritten', () => {
  const mine = copyStandard(KICE_STANDARD, { name: '○○고 2학기 기말' });
  assert.notEqual(mine.id, 'kice'); assert.equal(mine.base, 'kice'); assert.equal(KICE_STANDARD.name, '수능 틀');
  const back = importStandard(exportStandard(mine));
  assert.deepEqual({ ...back, source: undefined }, { ...mine, source: undefined });
  const kiceFile = importStandard(exportStandard(KICE_STANDARD));
  assert.notEqual(kiceFile.id, 'kice', 'importing the built-in standard makes a copy');
  assert.throws(() => importStandard('{"format":"other"}'), /조판 기준 파일/);
  assert.throws(() => importStandard(JSON.stringify({ ...mine, text: { ...mine.text, size: 99 } })), /범위/);
  assert.throws(() => validateStandard({ ...mine, fit: { ...mine.fit, low: 2, high: 0 } }), /범위|거꾸로/);
  const partial = resolveStandard({ id: 'std_x', name: '빈칸', paper: { size: 'B4' } });
  assert.equal(partial.paper.size, 'B4'); assert.equal(partial.text.ratio, 95, 'empty values follow KICE');
});

test('question → exam → KICE resolution, and the question carries only an id', () => {
  const mine = copyStandard(KICE_STANDARD, { name: '학교', id: 'std_school' });
  assert.equal(standardFor({ standardId: 'std_school' }, { standards: [mine] }).name, '학교');
  assert.equal(standardFor({}, { exam: { standardId: 'std_school' }, standards: [mine] }).name, '학교');
  assert.equal(standardFor({}, {}).id, 'kice');
  const q = structuredClone(examples.questions[0]);
  assert.equal(JSON.stringify(renderedContent(q)), JSON.stringify(renderedContent({ ...q, standardId: undefined })), 'no id keeps old fingerprints');
  validate({ format: FORMAT, questions: [{ ...q, standardId: 'std_school' }], documents: [] });
  assert.throws(() => validate({ format: FORMAT, questions: [{ ...q, standardId: 'bad id!' }], documents: [] }), /조판 기준/);
});

test('gaps before the ask and the choices: the question value, then the standard, KICE adds nothing', async () => {
  const q = structuredClone(examples.questions[0]);
  const base = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText });
  // 정확한 간격 문단: 위 여백 = 값 − 0.58mm(1pt 빈 문단 높이), 1pt 글자
  const spacer = mmValue => `margin-top:${mmToPx((mmValue - 0.58) / 2)}px"><span style="font-size:1pt">`; // 문항 안에서는 위 여백이 두 번 들어가 절반만
  const own = await buildQuestionHtml({ ...structuredClone(q), choicesGap: 2.5 }, prep, 343, { native: true, measureText });
  assert.ok(!base.html.includes(spacer(2.5)) && own.html.includes(spacer(2.5)), 'question choicesGap adds an exact spacer');
  const s = copyStandard(KICE_STANDARD, { name: '선지 앞 3mm' }); s.gaps.choices = 3;
  const std = await buildQuestionHtml(structuredClone(q), prep, 343, { native: true, measureText, standard: s });
  assert.ok(std.html.includes(spacer(3)), 'standard choices gap applies when the question has none');
  const both = await buildQuestionHtml({ ...structuredClone(q), choicesGap: 0 }, prep, 343, { native: true, measureText, standard: s });
  assert.equal(both.html, base.html, 'an explicit 0 on the question wins over the standard');
});

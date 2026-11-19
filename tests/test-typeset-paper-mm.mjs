// 조판 설정·간격 띠의 mm 칸(11-16 B7): 저장 값은 A4 2단 기준, 화면은 이 문항 용지의 실제 mm.
// standardForPaper 결과는 환산 도입 전과 같아야 하고(고정 해시), 화면 값 ↔ 저장 값 왕복이 흔들리지 않아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KICE_STANDARD, standardForPaper, paperScale, paperScaledPath, shownMm, storedMm } from '../assets/exampool/sheet/typeset-standard.js';

const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
// 시각(source.at) 없이 만든 사용자 기준. 고정 id라 해시가 실행마다 같다.
const custom = () => {
  const c = { ...structuredClone(KICE_STANDARD), id: 'std_fixed', name: '내 설정', base: 'kice', source: { kind: 'copy' }, version: 1 };
  c.gaps.choices = 1; c.gaps.text = 2.5; c.parts.cellPad = 0.5; c.parts.choiceTabs = [10, 20, 30]; c.gaps.boxPadSide = 3;
  return c;
};

// 고치기 전(ed41ae74) standardForPaper 결과 해시. 이 값이 바뀌면 조판 결과가 바뀐 것이다.
const PINNED = {
  'kice-A4': 'c65f10102444675e', 'kice-B4': '8b56c4ffc0befeef', 'kice-A3': '7f121186268ecbe2', 'kice-B5': 'c65f10102444675e',
  'custom-A4': '617aef7e3981f5e7', 'custom-B4': '156d4e139367c7d2', 'custom-A3': 'a1ded1f87ac5ea8c', 'custom-B5': '617aef7e3981f5e7',
};

test('standardForPaper output is unchanged by the paper-mm refactor', () => {
  const cases = { kice: KICE_STANDARD, custom: custom() };
  for (const [n, s] of Object.entries(cases)) for (const p of ['A4', 'B4', 'A3', 'B5']) {
    assert.equal(hash(standardForPaper(s, p)), PINNED[`${n}-${p}`], `${n}-${p}`);
  }
  const b4 = standardForPaper(KICE_STANDARD, 'B4');
  assert.equal(b4.gaps.choices, 0); assert.equal(b4.gaps.boxPadSide, 2.54); assert.equal(b4.parts.cellPad, 0.49);
  assert.deepEqual(b4.parts.choiceTabs, [21.6, 36, 56.02]);
  assert.equal(standardForPaper(custom(), 'B4').gaps.choices, 1.3);
});

test('paperScale is the column ratio for B4/A3 and 1 when no scaling applies', () => {
  const k = 111.98 / 86;
  assert.ok(Math.abs(paperScale(KICE_STANDARD, 'B4') - k) < 1e-9);
  assert.ok(Math.abs(paperScale(KICE_STANDARD, 'A3') - k) < 1e-9);
  assert.equal(paperScale(KICE_STANDARD, 'A4'), 1);
  assert.equal(paperScale(KICE_STANDARD, 'B5'), 1);
  assert.equal(paperScale(KICE_STANDARD, undefined), 1);
});

test('scaled paths are the gap, cell, number-indent and choice-tab values; fixed overrides are not', () => {
  assert.equal(paperScaledPath('gaps.choices', KICE_STANDARD), true);
  assert.equal(paperScaledPath('gaps.bogiPadSide', KICE_STANDARD), true);
  assert.equal(paperScaledPath('parts.cellPad', KICE_STANDARD), true);
  assert.equal(paperScaledPath('parts.choiceTabs.2', KICE_STANDARD), true);
  assert.equal(paperScaledPath('gaps.boxPadSide', KICE_STANDARD), false);
  assert.equal(paperScaledPath('gaps.boxPadSide', custom()), true);
  assert.equal(paperScaledPath('parts.bogiLineSpacing', KICE_STANDARD), false);
  assert.equal(paperScaledPath('parts.bogiTitleWidth', KICE_STANDARD), false);
  assert.equal(paperScaledPath('text.size', KICE_STANDARD), false);
  assert.equal(paperScaledPath('paper.columnGap', KICE_STANDARD), false);
});

test('shown and stored values round-trip without drift and match standardForPaper', () => {
  const k = paperScale(KICE_STANDARD, 'B4');
  // 화면에 1mm를 넣으면 저장 값은 1/k, 용지 맞춤 뒤 실제 값은 1.00mm
  const stored = storedMm(KICE_STANDARD, 'B4', 'gaps.choices', 1);
  assert.equal(stored, Math.round(1 / k * 10000) / 10000);
  const c = custom(); c.gaps.choices = stored;
  assert.equal(Math.round(standardForPaper(c, 'B4').gaps.choices * 100) / 100, 1);
  assert.equal(shownMm(c, 'B4', 'gaps.choices', stored), stored * k);
  for (const v of [0, 0.5, 1, 2.3, 7.1, 19.9]) {
    const back = shownMm(KICE_STANDARD, 'B4', 'gaps.text', storedMm(KICE_STANDARD, 'B4', 'gaps.text', v));
    assert.ok(Math.abs(back - v) < 1e-3, `round trip ${v} -> ${back}`);
    assert.equal(back.toFixed(2), v.toFixed(2));
  }
  // A4 문항 또는 환산 대상이 아닌 경로는 그대로
  assert.equal(shownMm(KICE_STANDARD, 'A4', 'gaps.choices', 0.7692), 0.7692);
  assert.equal(storedMm(KICE_STANDARD, 'A4', 'gaps.choices', 1), 1);
  assert.equal(shownMm(KICE_STANDARD, 'B4', 'gaps.boxPadSide', 2.54), 2.54);
  assert.equal(storedMm(KICE_STANDARD, 'B4', 'parts.rule', 0.12), 0.12);
});
